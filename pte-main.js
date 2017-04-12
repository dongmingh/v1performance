/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*
 *   usage:
 *      node pte-main.js <ui file> <Nid>
 *        - ui file: user input file
 *        - Nid: Network id
 */
// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('E2E');
logger.setLevel('DEBUG');

var path = require('path');

var hfc = require('fabric-client');
hfc.setLogger(logger);
var X509 = require('jsrsasign').X509;

var fs = require('fs');
var grpc = require('grpc');
var util = require('util');
var testUtil = require('./pte-util.js');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var FabricCAServices = require('fabric-ca-client/lib/FabricCAClientImpl');
var FabricCAClient = FabricCAServices.FabricCAClient;
var User = require('fabric-client/lib/User.js');
var Client = require('fabric-client/lib/Client.js');
var _commonProto = grpc.load(path.join(__dirname, '../../fabric-client/lib/protos/common/common.proto')).common;

var gopath=process.env.GOPATH;
console.log('GOPATH: ', gopath);

utils.setConfigSetting('crypto-keysize', 256);

const child_process = require('child_process');

var webUser = null;
var tmp;
var i=0;

testUtil.setupChaincodeDeploy();


// input: userinput json file
var Nid = parseInt(process.argv[2]);
var uiFile = process.argv[3];
var tStart = parseInt(process.argv[4]);
var uiContent = JSON.parse(fs.readFileSync(uiFile));
console.log('input parameters: Nid=%d, uiFile=%s, tStart=%d', Nid, uiFile, tStart);

var TLS=uiContent.TLS;
var channelID = uiContent.channelID;
var chaincode_id = uiContent.chaincodeID+channelID;
var chaincode_ver = uiContent.chaincodeVer;
var chain_id = uiContent.chainID+channelID;
console.log('[chaincodeInstall:Nid=%d] chaincode_id: %s, chaincode_ver: %s, chain_id: %s', Nid, chaincode_id, chaincode_ver, chain_id);

var channelOpt=uiContent.channelOpt;
var channelName=channelOpt.name;
var channelOrgName = [];
for (i=0; i<channelOpt.orgName.length; i++) {
    channelOrgName.push(channelOpt.orgName[i]);
}
console.log('TLS: %s', TLS.toUpperCase());
console.log('channelName: %s', channelName);
console.log('channelOrgName.length: %d, channelOrgName: %s', channelOrgName.length, channelOrgName);

var svcFile = uiContent.SCFile[0].ServiceCredentials;
console.log('svcFile; ', svcFile);
hfc.addConfigFile(path.join(__dirname, svcFile));
var ORGS = hfc.getConfigSetting('test-network');

var users =  hfc.getConfigSetting('users');


var transType = uiContent.transType;
var nRequest = parseInt(uiContent.nRequest);
var nThread = parseInt(uiContent.nThread);
var tCurr;


var testDeployArgs = [];
for (i=0; i<uiContent.deploy.args.length; i++) {
    testDeployArgs.push(uiContent.deploy.args[i]);
}

var tx_id = null;
var nonce = null;

var the_user = null;
var g_len = nThread;

var cfgtxFile;
var allEventhubs = [];
var org;
var orgName;

var targets = [];
var eventHubs=[];
var orderer;


function printChainInfo(chain) {
    console.log('[printChainInfo] chain name: ', chain.getName());
    console.log('[printChainInfo] orderers: ', chain.getOrderers());
    console.log('[printChainInfo] peers: ', chain.getPeers());
    console.log('[printChainInfo] events: ', eventHubs);
}

function clientNewOrderer(client, org) {
    if (TLS.toUpperCase() == 'ENABLED') {
        var caRootsPath = ORGS.orderer.tls_cacerts;
        let data = fs.readFileSync(path.join(__dirname, caRootsPath));
        let caroots = Buffer.from(data).toString();

        orderer = client.newOrderer(
            ORGS.orderer.url,
            {
                'pem': caroots,
                'ssl-target-name-override': ORGS.orderer['server-hostname']
            }
        );
    } else {
        orderer = client.newOrderer(ORGS.orderer.url);
    }
}

function chainAddOrderer(chain, client, org) {
    console.log('[chainAddOrderer] chain name: ', chain.getName());
    if (TLS.toUpperCase() == 'ENABLED') {
        var caRootsPath = ORGS.orderer.tls_cacerts;
        let data = fs.readFileSync(path.join(__dirname, caRootsPath));
        let caroots = Buffer.from(data).toString();

        chain.addOrderer(
            client.newOrderer(
                ORGS.orderer.url,
                {
                    'pem': caroots,
                    'ssl-target-name-override': ORGS.orderer['server-hostname']
                }
            )
        );
    } else {
        chain.addOrderer(
            client.newOrderer(ORGS.orderer.url)
        );
    }
}

function channelAddAllPeer(chain, client) {
    console.log('[channelAddAllPeer] chain name: ', chain.getName());
    var peerTmp;
    var eh;
    for (let key1 in ORGS) {
        if (ORGS.hasOwnProperty(key1)) {
            for (let key in ORGS[key1]) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    let data = fs.readFileSync(path.join(__dirname, ORGS[key1][key].tls_cacerts));
                    peerTmp = new Peer(
                        ORGS[key1][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key1][key].server-hostname
                        }
                    );
                    targets.push(peerTmp);
                    chain.addPeer(peerTmp);
                } else {
                    peerTmp = new Peer( ORGS[key1][key].requests);
                    targets.push(peerTmp);
                    chain.addPeer(peerTmp);
                }

                eh=new EventHub();
                if (TLS.toUpperCase() == 'ENABLED') {
                    eh.setPeerAddr(
                        ORGS[key1][key].events,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key1][key].server-hostname
                        }
                    );
                } else {
                    eh.setPeerAddr(ORGS[key1][key].events);
                }
                eh.connect();
                eventHubs.push(eh);
            }
            }
        }
    }
}

function channelRemoveAllPeer(chain, client) {
    console.log('[channelRemoveAllPeer] chain name: ', chain.getName());
    var peerTmp;
    var eh;
    for (let key1 in ORGS) {
        if (ORGS.hasOwnProperty(key1)) {
            for (let key in ORGS[key1]) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    let data = fs.readFileSync(path.join(__dirname, ORGS[key1][key].tls_cacerts));
                    peerTmp = new Peer(
                        ORGS[key1][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key1][key].server-hostname
                        }
                    );
                    if (chain.isValidPeer(peerTmp)) {
                        console.log('[channelRemoveAllPeer] chain remove peer: ', ORGS[key1][key].requests);
                        chain.removePeer(peerTmp);
                    }
                } else {
                    peerTmp = new Peer( ORGS[key1][key].requests);
                    if (chain.isValidPeer(peerTmp)) {
                        console.log('[channelRemoveAllPeer] chain remove peer: ', ORGS[key1][key].requests);
                        chain.removePeer(peerTmp);
                    }
                }

            }
            }
        }
    }
}

function channelAddAnchorPeer(chain, client) {
    console.log('[channelAddAnchorPeer] chain name: ', chain.getName());
    var peerTmp;
    var eh;
    for (let key in ORGS) {
        if (ORGS.hasOwnProperty(key) && typeof ORGS[key].peer1 !== 'undefined') {
                if (TLS.toUpperCase() == 'ENABLED') {
                    let data = fs.readFileSync(path.join(__dirname, ORGS[key].peer1['tls_cacerts']));
                    peerTmp = new Peer(
                        ORGS[key].peer1.requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key].peer1['server-hostname']
                        }
                    );
                    targets.push(peerTmp);
                    chain.addPeer(peerTmp);
                } else {
                    peerTmp = new Peer( ORGS[key].peer1.requests);
                    targets.push(peerTmp);
                    chain.addPeer(peerTmp);
                }

                eh=new EventHub();
                if (TLS.toUpperCase() == 'ENABLED') {
                    eh.setPeerAddr(
                        ORGS[key].peer1.events,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key].peer1['server-hostname']
                        }
                    );
                } else {
                    eh.setPeerAddr(ORGS[key].peer1.events);
                }
                eh.connect();
                eventHubs.push(eh);
                console.log('[channelAddAnchorPeer] requests: %s, events: %s ', ORGS[key].peer1.requests, ORGS[key].peer1.events);
        }
    }
}

function channelAddPeer(chain, client, org) {
    console.log('[channelAddPeer] chain name: ', chain.getName());
    var peerTmp;
    var eh;
    for (let key in ORGS[org]) {
        if (ORGS[org].hasOwnProperty(key)) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    let data = fs.readFileSync(path.join(__dirname, ORGS[org][key]['tls_cacerts']));
                    peerTmp = new Peer(
                        ORGS[org][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[org][key]['server-hostname']
                        }
                    );
                    targets.push(peerTmp);
                    chain.addPeer(peerTmp);
                } else {
                    peerTmp = new Peer( ORGS[org][key].requests);
                    targets.push(peerTmp);
                    chain.addPeer(peerTmp);
                }
            }
        }
    }
}

function channelRemovePeer(chain, client, org) {
    console.log('[channelRemovePeer] chain name: ', chain.getName());
    var peerTmp;
    var eh;
    for (let key in ORGS[org]) {
        if (ORGS[org].hasOwnProperty(key)) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    let data = fs.readFileSync(path.join(__dirname, ORGS[org][key]['tls_cacerts']));
                    peerTmp = new Peer(
                        ORGS[org][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[org][key]['server-hostname']
                        }
                    );
                    chain.removePeer(peerTmp);
                } else {
                    peerTmp = new Peer( ORGS[org][key].requests);
                    targets.push(peerTmp);
                    chain.removePeer(peerTmp);
                }
            }
        }
    }
}

function channelAddPeerEvent(chain, client, org) {
    console.log('[channelAddPeerEvent] chain name: ', chain.getName());
            var eh;
            var peerTmp;
            for (let key in ORGS[org]) {
                if (ORGS[org].hasOwnProperty(key)) {
                    if (key.indexOf('peer') === 0) {
                        if (TLS.toUpperCase() == 'ENABLED') {
                            let data = fs.readFileSync(path.join(__dirname, ORGS[org][key]['tls_cacerts']));
                            peerTmp = new Peer(
                                ORGS[org][key].requests,
                                {
                                    pem: Buffer.from(data).toString(),
                                    'ssl-target-name-override': ORGS[key]['server-hostname']
                                }
                            );
                        } else {
                            peerTmp = new Peer( ORGS[org][key].requests);
                            console.log('[channelAddPeerEvent] peer: ', ORGS[org][key].requests);
                        }
                        targets.push(peerTmp);
                        chain.addPeer(peerTmp);

                        eh=new EventHub();
                        if (TLS.toUpperCase() == 'ENABLED') {
                            eh.setPeerAddr(
                                ORGS[org][key].events,
                                {
                                    pem: Buffer.from(data).toString(),
                                    'ssl-target-name-override': ORGS[org][key]['server-hostname']
                                }
                            );
                        } else {
                            eh.setPeerAddr(ORGS[org][key].events);
                        }
                        eh.connect();
                        eventHubs.push(eh);
                        console.log('[channelAddPeerEvent] requests: %s, events: %s ', ORGS[org][key].requests, ORGS[org][key].events);
                    }
                }
            }
}
function channelAddEvent(chain, client, org) {
    console.log('[channelAddEvent] chain name: ', chain.getName());
            var eh;
            var peerTmp;
            for (let key in ORGS[org]) {
                if (ORGS[org].hasOwnProperty(key)) {
                    if (key.indexOf('peer') === 0) {

                        eh=new EventHub();
                        if (TLS.toUpperCase() == 'ENABLED') {
                            eh.setPeerAddr(
                                ORGS[org][key].events,
                                {
                                    pem: Buffer.from(data).toString(),
                                    'ssl-target-name-override': ORGS[org][key]['server-hostname']
                                }
                            );
                        } else {
                            eh.setPeerAddr(ORGS[org][key].events);
                        }
                        eh.connect();
                        eventHubs.push(eh);
                        console.log('[channelAddEvent] requests: %s, events: %s ', ORGS[org][key].requests, ORGS[org][key].events);
                    }
                }
                console.log('[channelAddEvent] event: ', eventHubs);
            }
}

// test begins ....
performance_main();

// install chaincode
function chaincodeInstall(chain, client, org) {
    console.log('chaincodeInstall: ', org);
    orgName = ORGS[org].name;

    chainAddOrderer(chain, client, org);

    channelAddPeer(chain, client, org);
    printChainInfo(chain);

    nonce = utils.getNonce();
    tx_id = hfc.buildTransactionID(nonce, the_user);
    nonce = utils.getNonce();
    var request_install = {
        targets: targets,
        chaincodePath: uiContent.deploy.chaincodePath,
        chaincodeId: chaincode_id,
        chaincodeVersion: chaincode_ver,
        txId: tx_id,
        nonce: nonce
    };

    console.log('request_install: ', request_install);

    //sendInstallProposal
    client.installChaincode(request_install)
    .then(
        function(results) {
            var proposalResponses = results[0];
            var proposal = results[1];
            var header   = results[2];
            var all_good = true;
            for(var i in proposalResponses) {
                let one_good = false;
                if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
                    one_good = true;
                    logger.info('install proposal(%s) was good', orgName);
                } else {
                    logger.error('install proposal(%s) was bad', orgName);
                }
                all_good = all_good & one_good;
            }
            if (all_good) {
                console.log(util.format('[chaincodeInstall] Successfully sent install Proposal to peers in (%s:%s) and received ProposalResponse: Status - %s', chain.getName(), orgName, proposalResponses[0].response.status));
                evtDisconnect();
                process.exit();
            } else {
                console.log('[chaincodeInstall] Failed to send install Proposal in (%s:%s) or receive valid response. Response null or status is not 200. exiting...', chain.getName(), orgName);
                evtDisconnect();
                process.exit();
            }

        }, (err) => {
            console.log('Failed to enroll user \'admin\'. ' + err);
            evtDisconnect();
            process.exit();

        });
}

//instantiate chaincode
function chaincodeInstantiate(chain, client, org) {
        console.log('[chaincodeInstantiate] org= %s, org name=%s, chain name=%s', org, orgName, chain.getName());

        chainAddOrderer(chain, client, org);
        channelAddAnchorPeer(chain, client);
        printChainInfo(chain);

        chain.initialize()
        .then((success) => {
            console.log('[chaincodeInstantiate:Nid=%d] Successfully initialize chain[%s]', Nid, chain.getName());

            nonce = utils.getNonce();
            tx_id = hfc.buildTransactionID(nonce, the_user);
            var request_instantiate = {
                chaincodePath: uiContent.deploy.chaincodePath,
                chaincodeId: chaincode_id,
                chaincodeVersion: chaincode_ver,
                fcn: uiContent.deploy.fcn,
                args: testDeployArgs,
                chainId: channelName,
                txId: tx_id,
                nonce: nonce
                // use this to demonstrate the following policy:
                // 'if signed by org1 admin, then that's the only signature required,
                // but if that signature is missing, then the policy can also be fulfilled
                // when members (non-admin) from both orgs signed'
//                'endorsement-policy': {
/*
                    identities: [
                        { role: { name: "member", mspId: "PeerOrg1" }},
                        { role: { name: "member", mspId: "PeerOrg2" }}
                    ],
                    policy: {
                        "1-of": [{ "signed-by": 0 }, { "signed-by": 1 }]
                    }
*/

/*
                        identities: [
                                { role: { name: 'member', mspId: ORGS['testOrg1'].mspid }},
                                { role: { name: 'member', mspId: ORGS['testOrg2'].mspid }},
                                { role: { name: 'admin', mspId: ORGS['testOrg1'].mspid }}
                        ],
                        policy: {
                                '1-of': [
                                        { 'signed-by': 2},
                                        { '2-of': [{ 'signed-by': 0}, { 'signed-by': 1 }]}
                                ]
                        }
                }
*/
            };

            // sendInstantiateProposal
            //console.log('request_instantiate: ', request_instantiate);
            return chain.sendInstantiateProposal(request_instantiate);
        },
        function(err) {
            console.log('Failed to initialize chain[%s] due to error: ', chain.getName(),  err.stack ? err.stack : err);
            evtDisconnect();
            process.exit();
        })
    .then(
        function(results) {
            var proposalResponses = results[0];
            var proposal = results[1];
            var header   = results[2];
            var all_good = true;
            for(var i in proposalResponses) {
                let one_good = false;
                if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
                    one_good = true;
                    logger.info('chaincode instantiation was good');
                } else {
                    logger.error('chaincode instantiation was bad');
                }
                all_good = all_good & one_good;
            }
            if (all_good) {
                console.log(util.format('[chaincodeInstantiate] Successfully sent chaincode instantiation Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));


                var request = {
                    proposalResponses: proposalResponses,
                    proposal: proposal,
                    header: header
                };

                var deployId = tx_id.toString();
                var eventPromises = [];
                eventHubs.forEach((eh) => {
                    let txPromise = new Promise((resolve, reject) => {
                        let handle = setTimeout(reject, 30000);

                        eh.registerTxEvent(deployId.toString(), (tx, code) => {
                            var tCurr1=new Date().getTime();
                            console.log('[chaincodeInstantiate] tCurr=%d, The chaincode instantiate transaction time=%d', tCurr, tCurr1-tCurr);
                            //console.log('[chaincodeInstantiate] The chaincode instantiate transaction has been committed on peer '+ eh.ep.addr);
                            clearTimeout(handle);
                            eh.unregisterTxEvent(deployId);

                            if (code !== 'VALID') {
                                console.log('[chaincodeInstantiate] The chaincode instantiate transaction was invalid, code = ' + code);
                                reject();
                            } else {
                                console.log('[chaincodeInstantiate] The chaincode instantiate transaction was valid.');
                                resolve();
                            }
                        });
                    });

                    eventPromises.push(txPromise);
                });

                var sendPromise = chain.sendTransaction(request);
                var tCurr=new Date().getTime();
                console.log('[chaincodeInstantiate] Promise.all tCurr=%d', tCurr);
                return Promise.all([sendPromise].concat(eventPromises))

                .then((results) => {

                    console.log('[chaincodeInstantiate] Event promise all complete and testing complete');
                    return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
                }).catch((err) => {
                    var tCurr1=new Date().getTime();
                    console.log('[chaincodeInstantiate] failed to send instantiate transaction: tCurr=%d, elapse time=%d', tCurr, tCurr1-tCurr);
                    //console.log('Failed to send instantiate transaction and get notifications within the timeout period.');
                    evtDisconnect();
                    throw new Error('Failed to send instantiate transaction and get notifications within the timeout period.');

                });
            } else {
                console.log('[chaincodeInstantiate] Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...');
                evtDisconnect();
                throw new Error('Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...');
            }
        },
        function(err) {

                console.log('Failed to send instantiate proposal due to error: ' + err.stack ? err.stack : err);
                evtDisconnect();
                throw new Error('Failed to send instantiate proposal due to error: ' + err.stack ? err.stack : err);
        })
    .then((response) => {
            if (response.status === 'SUCCESS') {
                console.log('[chaincodeInstantiate(Nid=%d)] Successfully instantiate transaction on %s. ', Nid, chain.getName());
                evtDisconnect();
                return;
            } else {
                console.log('[chaincodeInstantiate(Nid=%d)] Failed to instantiate transaction on %s. Error code: ', Nid, chain.getName(), response.status);
                evtDisconnect();
            }

        }, (err) => {
            console.log('[chaincodeInstantiate(Nid=%d)] Failed to instantiate transaction on %s due to error: ', Nid, chain.getName(), err.stack ? err.stack : err);
            evtDisconnect();
        }
    );
}

//create channel
function createOneChannel(client, org) {
        orgName = ORGS[org].name;
        console.log('[createOneChannel] org= %s, org name=%s', org, orgName);

        clientNewOrderer(client, org);

            // Acting as a client in org when creating the channel

            hfc.newDefaultKeyValueStore({
                path: testUtil.storePathForOrg(orgName)
            })
            .then((store) => {
                client.setStateStore(store);
                return testUtil.getSubmitter(users.username, users.secret, client, false, org)
            })
            .then((admin) => {
                console.log('[createOneChannel] Successfully enrolled user \'admin\'');
                the_user = admin;

                //FIXME: temporary fix until mspid is configured into Chain
                //the_user.mspImpl._id = ORGS[org].mspid;

                // readin the envelope to send to the orderer
                cfgtxFile=gopath+'/src/github.com/hyperledger/fabric/common/tools/cryptogen/crypto-config/ordererOrganizations/'+channelName+'.tx';
                var data =fs.readFileSync(cfgtxFile);
                console.log('[createOneChannel] Successfully read file: %s', cfgtxFile);
                var request = {
                        envelope : data,
                        name : channelName,
                        orderer : orderer
                };
                // send to orderer
                //console.log('chain orderer: ', chain.getOrderers());
                console.log('request: ',request);
                return client.createChannel(request);
            }, (err) => {
                console.log('Failed to enroll user \'admin\'. ' + err);
                evtDisconnect();
                process.exit();
            })
            .then((chain) => {
                logger.debug(' response ::%j',chain);

                if (chain) {
                        var test_orderers = chain.getOrderers();
                        if(test_orderers) {
                                var test_orderer = test_orderers[0];
                                if(test_orderer === orderer) {
                                        console.log('Successfully created the channel(%s).', channelName);
                                }
                                else {
                                        console.log('Chain did not have the orderer.');
                                }
                        }
                        return;
                } else {
                        console.log('Failed to create the channel. ');
                        evtDisconnect();
                        process.exit();
                }

            }, (err) => {
                console.log('Failed to initialize the channel: ' + err.stack ? err.stack : err);
                evtDisconnect();
                process.exit();
            })
            .then((nothing) => {
                console.log('Successfully waited to make sure new channel was created.');
                evtDisconnect();
                process.exit();
            }, (err) => {
                console.log('Failed due to error: ' + err.stack ? err.stack : err);
                evtDisconnect();
                process.exit();
            });
}

// join channel
function joinChannel(chain, client, org) {
        orgName = ORGS[org].name;
        console.log('[joinChannel] Calling peers in organization "%s" to join the channel "%s"', orgName, chain.getName());
        //console.log('[joinChannel] user name: ', users.username, users.secret);

        // add orderers
        chainAddOrderer(chain, client, org);

        // add peers and events
        channelAddPeerEvent(chain, client, org);

        printChainInfo(chain);

        return hfc.newDefaultKeyValueStore({
                path: testUtil.storePathForOrg(orgName)
        })
        .then((store) => {
                client.setStateStore(store);
                console.log('[joinChannel] user name: ', users.username, users.secret);
                return testUtil.getSubmitter(users.username, users.secret, client, false, org);
        })
        .then((admin) => {
                console.log('[joinChannel:%s] Successfully enrolled user \'admin\'', org);
                the_user = admin;

                nonce = utils.getNonce();
                tx_id = hfc.buildTransactionID(nonce, the_user);
                var request = {
                        targets : targets,
                        txId :  tx_id,
                        nonce : nonce
                };
                var eventPromises = [];
                //console.log('[joinChannel] for each', eventHubs);

                eventHubs.forEach((eh) => {
                        let txPromise = new Promise((resolve, reject) => {
                                let handle = setTimeout(reject, 30000);
//                console.log('[joinChannel] for each eh', eh);

                                eh.registerBlockEvent((block) => {
                                        clearTimeout(handle);

                                        // in real-world situations, a peer may have more than one channels so
                                        // we must check that this block came from the channel we asked the peer to join
                                        if(block.data.data.length === 1) {
                                                // Config block must only contain one transaction
                                                var envelope = _commonProto.Envelope.decode(block.data.data[0]);
                                                var payload = _commonProto.Payload.decode(envelope.payload);
                                                var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);

                                                if (channel_header.channel_id === channelName) {
                                                        console.log('The new channel has been successfully joined on peer '+ eh.ep._endpoint.addr);
                                                        resolve();
                                                }
                                        }
                                }, (err) => {
                                    console.log('Failed to registerBlockEvent due to error: ' + err.stack ? err.stack : err);
                                    throw new Error('Failed to registerBlockEvent due to error: ' + err.stack ? err.stack : err);
                                });
                        }, (err) => {
                            console.log('Failed to Promise due to error: ' + err.stack ? err.stack : err);
                            throw new Error('Failed to Promise due to error: ' + err.stack ? err.stack : err);
                        });

                        eventPromises.push(txPromise);
                });


                var sendPromise = chain.joinChannel(request);
                return Promise.all([sendPromise].concat(eventPromises));
        }, (err) => {
                console.log('[joinChannel] Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
                evtDisconnect();
                throw new Error('[joinChannel] Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
        })
        .then((results) => {
                console.log(util.format('[joinChannel] join Channel R E S P O N S E : %j', results));

                if(results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
                        console.log('[joinChannel] Successfully joined peers in (%s:%s)', channelName, orgName);
                        evtDisconnect();
                } else {
                        console.log('[joinChannel] Failed to join peers in (%s:%s)', channelName, orgName);
                        evtDisconnect();
                        throw new Error('Failed to join channel');
                }
        }, (err) => {
                console.log('Failed to join channel due to error: ' + err.stack ? err.stack : err);
                evtDisconnect();
        });
}

function joinOneChannel(chain, client, org) {
        console.log('joinOneChannel:', org);
        console.log('[joinOneChannel] chain name: ', chain.getName());

        joinChannel(chain, client, org)
        .then(() => {
                console.log('[joinOneChannel] Successfully joined peers in organization %s to join the channel %s', ORGS[org].name, channelName);
                process.exit();
        }, (err) => {
                console.log(util.format('[joinOneChannel] Failed to join peers in organization "%s" to the channel', ORGS[org].name));
                process.exit();
        })
        .catch(function(err) {
                console.log('Failed request. ' + err);
                process.exit();
        });

}

// performance main
function performance_main() {
    // send proposal to endorser
    for (i=0; i<channelOrgName.length; i++ ) {
        org = channelOrgName[i];
        orgName=ORGS[org].name;
        console.log('[performance_main]: org=%s, org Name= %s', org, orgName);
        var client = new hfc();

        if ( (transType.toUpperCase() == 'INSTALL') || (transType.toUpperCase() == 'INSTANTIATE') ) {
                console.log('DEPLOY: ');

            hfc.newDefaultKeyValueStore({
                path: testUtil.storePathForOrg(orgName)
            })
            .then((store) => {
                client.setStateStore(store);
                testUtil.getSubmitter(users.username, users.secret, client, false, org)
                .then(
                    function(admin) {
                        console.log('[performance_main:Nid=%d] Successfully enrolled user \'admin\'', Nid);
                        the_user = admin;
                        if ( transType.toUpperCase() == 'INSTALL' ) {
                            var chain = client.newChain(channelName);
                            console.log('[performance_main] chain name: ', chain.getName());
                            chaincodeInstall(chain, client, org);
                        } else if ( transType.toUpperCase() == 'INSTANTIATE' ) {
                            var chain = client.newChain(channelName);
                            console.log('[performance_main] chain name: ', chain.getName());
                            chaincodeInstantiate(chain, client, org);
                        }
                    },
                    function(err) {
                        console.log('[Nid=%d] Failed to wait due to error: ', Nid, err.stack ? err.stack : err);
                        evtDisconnect();

                        return;
                    }
                );
            });
        } else if ( transType.toUpperCase() == 'INVOKE' ) {
            // spawn off processes for transactions
            for (var j = 0; j < nThread; j++) {
                var workerProcess = child_process.spawn('node', ['./pte-execRequest.js', j, Nid, uiFile, tStart]);

                workerProcess.stdout.on('data', function (data) {
                    console.log('stdout: ' + data);
                });

                workerProcess.stderr.on('data', function (data) {
                    console.log('stderr: ' + data);
                });

                workerProcess.on('close', function (code) {
                });
            }
        } else if ( transType.toUpperCase() == 'CHANNEL' ) {
            if ( channelOpt.action.toUpperCase() == 'CREATE' ) {
                createOneChannel(client, org);
            } else if ( channelOpt.action.toUpperCase() == 'JOIN' ) {
                var chain = client.newChain(channelName);
                console.log('[performance_main] chain name: ', chain.getName());
                joinChannel(chain, client, org);
            }
        } else {
            console.log('[Nid=%d] invalid transType: %s', Nid, transType);
        }

    }
}

function readFile(path) {
        return new Promise(function(resolve, reject) {
                fs.readFile(path, function(err, data) {
                        if (err) {
                                reject(err);
                        } else {
                                resolve(data);
                        }
                });
        });
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function evtDisconnect() {
    for ( i=0; i<g_len; i++) {
        if (eventHubs[i] && eventHubs[i].isconnected()) {
            logger.info('Disconnecting the event hub: %d', i);
            eventHubs[i].disconnect();
        }
    }
}
