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
var _commonProto = grpc.load(path.join(__dirname, 'node_modules/fabric-client/lib/protos/common/common.proto')).common;

//var gopath=process.env.GOPATH;
//console.log('GOPATH: ', gopath);

utils.setConfigSetting('crypto-keysize', 256);

const child_process = require('child_process');

var webUser = null;
var tmp;
var i=0;

//testUtil.setupChaincodeDeploy();


// input: userinput json file
var Nid = parseInt(process.argv[2]);
var uiFile = process.argv[3];
var tStart = parseInt(process.argv[4]);
console.log('input parameters: Nid=%d, uiFile=%s, tStart=%d', Nid, uiFile, tStart);
var uiContent = JSON.parse(fs.readFileSync(uiFile));

var TLS=uiContent.TLS;
var channelID = uiContent.channelID;
var chaincode_id = uiContent.chaincodeID+channelID;
var chaincode_ver = uiContent.chaincodeVer;
var chain_id = uiContent.chainID+channelID;
console.log('chaincode_id: %s, chaincode_ver: %s, chain_id: %s', Nid, chaincode_id, chaincode_ver, chain_id);

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
var nProc = parseInt(uiContent.nProc);
console.log('nProc ', nProc);
var tCurr;


var testDeployArgs = [];
for (i=0; i<uiContent.deploy.args.length; i++) {
    testDeployArgs.push(uiContent.deploy.args[i]);
}

var tx_id = null;
var nonce = null;

var the_user = null;
var g_len = nProc;

var cfgtxFile;
var allEventhubs = [];
var org;
var orgName;

var targets = [];
var eventHubs=[];
var orderer;


function printChainInfo(channel) {
    console.log('[printChainInfo] channel name: ', channel.getName());
    console.log('[printChainInfo] orderers: ', channel.getOrderers());
    console.log('[printChainInfo] peers: ', channel.getPeers());
    console.log('[printChainInfo] events: ', eventHubs);
}

function clientNewOrderer(client, org) {
    var ordererID = ORGS[org].ordererID;
    console.log('[clientNewOrderer] org: %s, ordererID: %s', org, ordererID);
    if (TLS.toUpperCase() == 'ENABLED') {
        var caRootsPath = ORGS['orderer'][ordererID].tls_cacerts;
        let data = fs.readFileSync(caRootsPath);
        let caroots = Buffer.from(data).toString();

        orderer = client.newOrderer(
            ORGS['orderer'][ordererID].url,
            {
                'pem': caroots,
                'ssl-target-name-override': ORGS['orderer'][ordererID]['server-hostname']
            }
        );
    } else {
        orderer = client.newOrderer(ORGS['orderer'][ordererID].url);
    }
    console.log('[clientNewOrderer] orderer: %s', ORGS['orderer'][ordererID].url);
}

function chainAddOrderer(channel, client, org) {
    console.log('[chainAddOrderer] channel name: ', channel.getName());
    var ordererID = ORGS[org].ordererID;
    if (TLS.toUpperCase() == 'ENABLED') {
        var caRootsPath = ORGS['orderer'][ordererID].tls_cacerts;
        var data = fs.readFileSync(caRootsPath);
        let caroots = Buffer.from(data).toString();

        channel.addOrderer(
            client.newOrderer(
                ORGS['orderer'][ordererID].url,
                {
                    'pem': caroots,
                    'ssl-target-name-override': ORGS['orderer'][ordererID]['server-hostname']
                }
            )
        );
    } else {
        channel.addOrderer(
            client.newOrderer(ORGS['orderer'][ordererID].url)
        );
    }
    console.log('[chainAddOrderer] channel name: ', channel.getName());
}

function channelAddAllPeer(chain, client) {
    console.log('[channelAddAllPeer] channel name: ', channel.getName());
    var peerTmp;
    var data;
    var eh;
    for (let key1 in ORGS) {
        if (ORGS.hasOwnProperty(key1)) {
            for (let key in ORGS[key1]) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    data = fs.readFileSync(ORGS[key1][key].tls_cacerts);
                    peerTmp = client.newPeer(
                        ORGS[key1][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key1][key]['server-hostname']
                        }
                    );
                    targets.push(peerTmp);
                    channel.addPeer(peerTmp);
                } else {
                    peerTmp = client.newPeer( ORGS[key1][key].requests);
                    targets.push(peerTmp);
                    channel.addPeer(peerTmp);
                }

                eh=client.newEventHub();
                if (TLS.toUpperCase() == 'ENABLED') {
                    eh.setPeerAddr(
                        ORGS[key1][key].events,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key1][key]['server-hostname']
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

function channelRemoveAllPeer(channel, client) {
    console.log('[channelRemoveAllPeer] channel name: ', channel.getName());
    var peerTmp;
    var data;
    var eh;
    for (let key1 in ORGS) {
        if (ORGS.hasOwnProperty(key1)) {
            for (let key in ORGS[key1]) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    data = fs.readFileSync(ORGS[key1][key].tls_cacerts);
                    peerTmp = client.newPeer(
                        ORGS[key1][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[key1][key]['server-hostname']
                        }
                    );
                    console.log('[channelRemoveAllPeer] channel remove peer: ', ORGS[key1][key].requests);
                    channel.removePeer(peerTmp);
                } else {
                    peerTmp = client.newPeer( ORGS[key1][key].requests);
                    console.log('[channelRemoveAllPeer] channel remove peer: ', ORGS[key1][key].requests);
                    channel.removePeer(peerTmp);
                }

            }
            }
        }
    }
}

function channelAddAnchorPeer(channel, client, org) {
    console.log('[channelAddAnchorPeer] channel name: ', channel.getName());
    var peerTmp;
    var data;
    var eh;
    for (let key in ORGS) {
        if (ORGS.hasOwnProperty(key) && typeof ORGS[key].peer1 !== 'undefined') {
            if (TLS.toUpperCase() == 'ENABLED') {
                data = fs.readFileSync(ORGS[key].peer1['tls_cacerts']);
                peerTmp = client.newPeer(
                    ORGS[key].peer1.requests,
                    {
                        pem: Buffer.from(data).toString(),
                        'ssl-target-name-override': ORGS[key].peer1['server-hostname']
                    }
                );
                targets.push(peerTmp);
                channel.addPeer(peerTmp);
            } else {
                peerTmp = client.newPeer( ORGS[key].peer1.requests);
                targets.push(peerTmp);
                channel.addPeer(peerTmp);
            }
            console.log('[channelAddAnchorPeer] requests: %s', ORGS[key].peer1.requests);

            //an event listener can only register with a peer in its own org
            if ( key == org ) {
                eh=client.newEventHub();
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
                console.log('[channelAddAnchorPeer] events: %s ', ORGS[key].peer1.events);
            }
        }
    }
}

function channelAddPeer(channel, client, org) {
    console.log('[channelAddPeer] channel name: ', channel.getName());
    var peerTmp;
    var eh;
    for (let key in ORGS[org]) {
        if (ORGS[org].hasOwnProperty(key)) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    let data = fs.readFileSync(ORGS[org][key]['tls_cacerts']);
                    peerTmp = client.newPeer(
                        ORGS[org][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[org][key]['server-hostname']
                        }
                    );
                    targets.push(peerTmp);
                    channel.addPeer(peerTmp);
                } else {
                    peerTmp = client.newPeer( ORGS[org][key].requests);
                    targets.push(peerTmp);
                    channel.addPeer(peerTmp);
                }
            }
        }
    }
}

function channelRemovePeer(channel, client, org) {
    console.log('[channelRemovePeer] channel name: ', channel.getName());
    var peerTmp;
    var eh;
    for (let key in ORGS[org]) {
        if (ORGS[org].hasOwnProperty(key)) {
            if (key.indexOf('peer') === 0) {
                if (TLS.toUpperCase() == 'ENABLED') {
                    let data = fs.readFileSync(ORGS[org][key]['tls_cacerts']);
                    peerTmp = client.newPeer(
                        ORGS[org][key].requests,
                        {
                            pem: Buffer.from(data).toString(),
                            'ssl-target-name-override': ORGS[org][key]['server-hostname']
                        }
                    );
                    channel.removePeer(peerTmp);
                } else {
                    peerTmp = client.newPeer( ORGS[org][key].requests);
                    targets.push(peerTmp);
                    channel.removePeer(peerTmp);
                }
            }
        }
    }
}


function channelAddPeerEventJoin(channel, client, org) {
    console.log('[channelAddPeerEvent] channel name: ', channel.getName());
            var eh;
            var peerTmp;
            for (let key in ORGS[org]) {
                if (ORGS[org].hasOwnProperty(key)) {
                    if (key.indexOf('peer') === 0) {
                        if (TLS.toUpperCase() == 'ENABLED') {
                            let data = fs.readFileSync(ORGS[org][key]['tls_cacerts']);
                            targets.push(
                                client.newPeer(
                                    ORGS[org][key].requests,
                                    {
                                        pem: Buffer.from(data).toString(),
                                        'ssl-target-name-override': ORGS[org][key]['server-hostname']
                                    }
                                )
                            );
                        } else {
                            targets.push(
                                client.newPeer(
                                    ORGS[org][key].requests
                                )
                            );
                            console.log('[channelAddPeerEvent] peer: ', ORGS[org][key].requests);
                        }

                        eh=client.newEventHub();
                        if (TLS.toUpperCase() == 'ENABLED') {
                            let data = fs.readFileSync(ORGS[org][key]['tls_cacerts']);
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

function channelAddPeerEvent(channel, client, org) {
    console.log('[channelAddPeerEvent] channel name: ', channel.getName());
            var eh;
            var peerTmp;
            for (let key in ORGS[org]) {
                if (ORGS[org].hasOwnProperty(key)) {
                    if (key.indexOf('peer') === 0) {
                        if (TLS.toUpperCase() == 'ENABLED') {
                            let data = fs.readFileSync(ORGS[org][key]['tls_cacerts']);
                            peerTmp = client.newPeer(
                                    ORGS[org][key].requests,
                                    {
                                        pem: Buffer.from(data).toString(),
                                        'ssl-target-name-override': ORGS[org][key]['server-hostname']
                                    }
                            );
                            targets.push(peerTmp);
                            channel.addPeer(peerTmp);
                        } else {
                            peerTmp = client.newPeer(
                                    ORGS[org][key].requests
                            );
                            channel.addPeer(peerTmp);
                            console.log('[channelAddPeerEvent] peer: ', ORGS[org][key].requests);
                        }

                        eh=client.newEventHub();
                        if (TLS.toUpperCase() == 'ENABLED') {
                            let data = fs.readFileSync(ORGS[org][key]['tls_cacerts']);
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
function channelAddEvent(channel, client, org) {
    console.log('[channelAddEvent] channel name: ', channel.getName());
            var eh;
            var peerTmp;
            for (let key in ORGS[org]) {
                if (ORGS[org].hasOwnProperty(key)) {
                    if (key.indexOf('peer') === 0) {

                        eh=client.newEventHub();
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
function chaincodeInstall(channel, client, org) {
    orgName = ORGS[org].name;
    console.log('[chaincodeInstall] org: %s, org Name: %s, channel name: %s', org, orgName, channel.getName());

    var cryptoSuite = hfc.newCryptoSuite();
    cryptoSuite.setCryptoKeyStore(hfc.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
    client.setCryptoSuite(cryptoSuite);

    chainAddOrderer(channel, client, org);

    channelAddPeer(channel, client, org);
    //printChainInfo(channel);

    //TODO: Probably this property is configurable ?
    process.env.GOPATH = __dirname;

    //sendInstallProposal
    var request_install = {
        targets: targets,
        chaincodePath: uiContent.deploy.chaincodePath,
        chaincodeId: chaincode_id,
        chaincodeVersion: chaincode_ver
    };

    console.log('request_install: ', request_install);

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
                    logger.info('[chaincodeInstall] org(%s): install proposal was good', org);
                } else {
                    logger.error('[chaincodeInstall] org(%s): install proposal was bad', org);
                }
                all_good = all_good & one_good;
            }
            if (all_good) {
                console.log(util.format('[chaincodeInstall] Successfully sent install Proposal to peers in (%s:%s) and received ProposalResponse: Status - %s', channelName, orgName, proposalResponses[0].response.status));
                evtDisconnect();
                process.exit();
            } else {
                console.log('[chaincodeInstall] Failed to send install Proposal in (%s:%s) or receive valid response. Response null or status is not 200. exiting...', channelName, orgName);
                evtDisconnect();
                process.exit();
            }

        }, (err) => {
            console.log('Failed to enroll user \'admin\'. ' + err);
            evtDisconn;
            process.exit();

        });
}

function buildChaincodeProposal(client, the_user, upgrade, transientMap) {
        let tx_id = client.newTransactionID();

        // send proposal to endorser
        var request = {
                chaincodePath: uiContent.deploy.chaincodePath,
                chaincodeId: chaincode_id,
                chaincodeVersion: chaincode_ver,
                fcn: uiContent.deploy.fcn,
                args: testDeployArgs,
                chainId: channelName,
                txId: tx_id
                // use this to demonstrate the following policy:
                // 'if signed by org1 admin, then that's the only signature required,
                // but if that signature is missing, then the policy can also be fulfilled
                // when members (non-admin) from both orgs signed'
/*
                'endorsement-policy': {
                        identities: [
                                { role: { name: 'member', mspId: ORGS['org1'].mspid }},
                                { role: { name: 'member', mspId: ORGS['org2'].mspid }},
                                { role: { name: 'admin', mspId: ORGS['org1'].mspid }}
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

        if(upgrade) {
                // use this call to test the transient map support during chaincode instantiation
                request.transientMap = transientMap;
        }

        return request;
}

//instantiate chaincode
function chaincodeInstantiate(channel, client, org) {
        var cryptoSuite = Client.newCryptoSuite();
        cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
        client.setCryptoSuite(cryptoSuite);

        console.log('[chaincodeInstantiate] org= %s, org name=%s, channel name=%s', org, orgName, channel.getName());

        chainAddOrderer(channel, client, org);
        //channelAddPeerEvent(chain, client, org);
        channelAddAnchorPeer(channel, client, org);
        //printChainInfo(channel);

        channel.initialize()
        .then((success) => {
            console.log('[chaincodeInstantiate:Nid=%d] Successfully initialize channel[%s]', Nid, channel.getName());
            var upgrade = false;

            var badTransientMap = { 'test1': 'transientValue' }; // have a different key than what the chaincode example_cc1.go expects in Init()
            var transientMap = { 'test': 'transientValue' };
            var request = buildChaincodeProposal(client, the_user, upgrade, badTransientMap);
            tx_id = request.txId;

            // sendInstantiateProposal
            //console.log('request_instantiate: ', request_instantiate);
            return channel.sendInstantiateProposal(request);
        },
        function(err) {
            console.log('[chaincodeInstantiate:Nid=%d] Failed to initialize channel[%s] due to error: ', Nid,  channelName, err.stack ? err.stack : err);
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
                    logger.info('[chaincodeInstantiate] channelName(%s) chaincode instantiation was good', channelName);
                } else {
                    logger.error('[chaincodeInstantiate] channelName(%s) chaincode instantiation was bad', channelName);
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

                var deployId = tx_id.getTransactionID();
                var eventPromises = [];
                eventHubs.forEach((eh) => {
                    let txPromise = new Promise((resolve, reject) => {
                        let handle = setTimeout(reject, 120000);

                        eh.registerTxEvent(deployId.toString(), (tx, code) => {
                            var tCurr1=new Date().getTime();
                            //console.log('[chaincodeInstantiate] tCurr=%d, The chaincode instantiate transaction time=%d', tCurr, tCurr1-tCurr);
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

                var sendPromise = channel.sendTransaction(request);
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
                console.log('[chaincodeInstantiate(Nid=%d)] Successfully instantiate transaction on %s. ', Nid, channelName);
                evtDisconnect();
                return;
            } else {
                console.log('[chaincodeInstantiate(Nid=%d)] Failed to instantiate transaction on %s. Error code: ', Nid, channelName, response.status);
                evtDisconnect();
            }

        }, (err) => {
            console.log('[chaincodeInstantiate(Nid=%d)] Failed to instantiate transaction on %s due to error: ', Nid, channelName, err.stack ? err.stack : err);
            evtDisconnect();
        }
    );
}

function readAllFiles(dir) {
        var files = fs.readdirSync(dir);
        var certs = [];
        files.forEach((file_name) => {
                let file_path = path.join(dir,file_name);
                console.log('[readAllFiles] looking at file ::'+file_path);
                let data = fs.readFileSync(file_path);
                certs.push(data);
        });
        return certs;
}


function pushMSP(client, msps) {

    for (let key in ORGS) {
        console.log('[pushMSP] key: %s, ORGS[key].mspid: %s', key, ORGS[key].mspid);
        if (key.indexOf('org') === 0) {
            //orderer
            var msp = {};
            var ordererID = ORGS[key].ordererID;
            msp.id = ORGS['orderer'][ordererID].mspid;
            var comName = ORGS['orderer'][ordererID].comName;
            msp.rootCerts = readAllFiles(path.join(ORGS['orderer'][ordererID].mspPath+'/ordererOrganizations/'+comName+'/msp/', 'cacerts'));
            msp.admin = readAllFiles(path.join(ORGS['orderer'][ordererID].mspPath+'/ordererOrganizations/'+comName+'/msp/', 'admincerts'));
            msps.push(client.newMSP(msp));
            // org
            var msp = {};
            msp.id = ORGS[key].mspid;
            var comName = ORGS[key].comName;
            msp.rootCerts = readAllFiles(path.join(ORGS[key].mspPath+'/peerOrganizations/'+key+'.'+comName+'/msp/', 'cacerts'));
            msp.admin = readAllFiles(path.join(ORGS[key].mspPath+'/peerOrganizations/'+key+'.'+comName+'/msp/', 'admincerts'));
            msps.push(client.newMSP(msp));
        }
    }
}

//create channel
function createOneChannel(client, org) {
        orgName = ORGS[org].name;
        console.log('[createOneChannel] org= %s, org name= %s', org, orgName);
        var username = ORGS[org].username;
        var secret = ORGS[org].secret;
        console.log('[createOneChannel] user= %s, secret= %s', username, secret);

        clientNewOrderer(client, org);

        var config = null;
        var envelope_bytes = null;
        var signatures = [];
        var msps = [];
        var key;

        //pushMSP(client, msps);

         console.log(util.format('hfc: %j', hfc));
for (var key in hfc) {
  console.log(util.format('key: %s, value: %s, type: %s', key, hfc[key], typeof hfc[key]));
}
        utils.setConfigSetting('key-value-store', 'fabric-client/lib/impl/FileKeyValueStore.js');

            hfc.newDefaultKeyValueStore({
                path: testUtil.storePathForOrg(orgName)
            })
            .then((store) => {
                client.setStateStore(store);
                var cryptoSuite = hfc.newCryptoSuite();
                cryptoSuite.setCryptoKeyStore(hfc.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
                client.setCryptoSuite(cryptoSuite);

                key = 'org1';
                username=ORGS[key].username;
                secret=ORGS[key].secret;
                client._userContext = null;
                return testUtil.getSubmitter(username, secret, client, true, key, svcFile);
            }).then((admin) => {
                //the_user = admin;
                console.log('[createOneChannel] Successfully enrolled user \'admin\' for', key);
                var channelTX=channelOpt.channelTX;
                console.log('[createOneChannel] channelTX: ', channelTX);
                envelope_bytes = fs.readFileSync(channelTX);
                config = client.extractChannelConfig(envelope_bytes);
                console.log('[createOneChannel] Successfull extracted the config update from the configtx envelope: ', channelTX);

                var signature = client.signChannelConfig(config);
                console.log('[createOneChannel] Successfully signed config update: ', key);
                // collect signature from org1 admin
                // TODO: signature counting against policies on the orderer
                // at the moment is being investigated, but it requires this
                // weird double-signature from each org admin
                signatures.push(signature);
                signatures.push(signature);
                //console.log('[createOneChannel] org-signature: ', signature);

                key = 'org2';
                username=ORGS[key].username;
                secret=ORGS[key].secret;
                client._userContext = null;
                return testUtil.getSubmitter(username, secret, client, true, key, svcFile);
            }).then((admin) => {
                //the_user = admin;
                console.log('[createOneChannel] Successfully enrolled user \'admin\' for', key);
                var signature = client.signChannelConfig(config);
                console.log('[createOneChannel] Successfully signed config update: ', key);
                // collect signature from org1 admin
                // TODO: signature counting against policies on the orderer
                // at the moment is being investigated, but it requires this
                // weird double-signature from each org admin
                signatures.push(signature);
                signatures.push(signature);
                //console.log('[createOneChannel] org-signature: ', signature);

                key='org1';
                client._userContext = null;
                return testUtil.getOrderAdminSubmitter(client, key, svcFile);
            }).then((admin) => {
                the_user = admin;
                console.log('[createOneChannel] Successfully enrolled user \'admin\' for', key);
                var signature = client.signChannelConfig(config);
                console.log('[createOneChannel] Successfully signed config update: ', key);
                console.log('[createOneChannel] admin : ', admin);
                // collect signature from org1 admin
                // TODO: signature counting against policies on the orderer
                // at the moment is being investigated, but it requires this
                // weird double-signature from each org admin
                signatures.push(signature);
                signatures.push(signature);
                //console.log('[createOneChannel] orderer-signature: ', signature);
                key='org2';
                client._userContext = null;
                return testUtil.getOrderAdminSubmitter(client, key, svcFile);
            }).then((admin) => {
                the_user = admin;
                console.log('[createOneChannel] Successfully enrolled user \'admin\' for', key);
                var signature = client.signChannelConfig(config);
                console.log('[createOneChannel] Successfully signed config update: ', key);
                console.log('[createOneChannel] admin : ', admin);
                // collect signature from org1 admin
                // TODO: signature counting against policies on the orderer
                // at the moment is being investigated, but it requires this
                // weird double-signature from each org admin
                signatures.push(signature);
                signatures.push(signature);
                //console.log('[createOneChannel] orderer-signature: ', signature);

                // sign config for all org
/*

                for (let key in ORGS) {
                    console.log('[createOneChannel] key: %s ', key);

                    if ( key.indexOf('org') === 0) {
                    username=ORGS[key].username;
                    secret=ORGS[key].secret;
                    console.log('[createOneChannel] key: %s, username: %s, secret: %s', key, username, secret);
                        client._userContext = null;
                        testUtil.getSubmitter(username, secret, client, true, key, svcFile)
                        .then((admin) => {
                                console.log('[createOneChannel] Successfully enrolled user \'admin\' for', key);
                                var signature = client.signChannelConfig(config);
                                console.log('[createOneChannel] Successfully signed config update: ', key);
                                // collect signature from org1 admin
                                // TODO: signature counting against policies on the orderer
                                // at the moment is being investigated, but it requires this
                                // weird double-signature from each org admin
                                signatures.push(signature);
                                signatures.push(signature);
                                console.log('[createOneChannel] org-signature: ', signature);
                            }
                        )
                    } 
                }
                    var key='orderer';
                        client._userContext = null;
                        testUtil.getOrderAdminSubmitter(client, key, svcFile)
                        .then((admin) => {
                                the_user = admin;
                                console.log('[createOneChannel] Successfully enrolled user \'admin\' for', key);
                                var signature = client.signChannelConfig(config);
                                console.log('[createOneChannel] Successfully signed config update: ', key);
                                // collect signature from org1 admin
                                // TODO: signature counting against policies on the orderer
                                // at the moment is being investigated, but it requires this
                                // weird double-signature from each org admin
                                signatures.push(signature);
                                signatures.push(signature);
                                console.log('[createOneChannel] orderer-signature: ', signature);
                            }
                        )
*/


                //console.log('[createOneChannel] signatures: ', signatures);
                console.log('[createOneChannel] done signing: %s', channelName);

                // build up the create request
                //let nonce = utils.getNonce();
                //let tx_id = Client.buildTransactionID(nonce, the_user);
                let tx_id = client.newTransactionID();
                var request = {
                        config: config,
                        signatures : signatures,
                        name : channelName,
                        orderer : orderer,
                        txId  : tx_id
                };

                console.log('request: ',request);
                return client.createChannel(request);
            }, (err) => {
                console.log('Failed to enroll user \'admin\'. ' + err);
                evtDisconnect();
                process.exit();
            })
            .then((result) => {

                console.log('[createOneChannel] Successfully created the channel (%s).', channelName);
                evtDisconnect();
                process.exit();

            }, (err) => {
                console.log('Failed to create the channel (%s) ', channelName);
                console.log('Failed to create the channel:: %j '+ err.stack ? err.stack : err);
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
function joinChannel(channel, client, org) {
        orgName = ORGS[org].name;
        console.log('[joinChannel] Calling peers in organization (%s) to join the channel (%s)', orgName, channelName);
        var username = ORGS[org].username;
        var secret = ORGS[org].secret;
        console.log('[joinChannel] user=%s, secret=%s', username, secret);
        var genesis_block = null;

        // add orderers
        chainAddOrderer(channel, client, org);

        //printChainInfo(channel);

        return hfc.newDefaultKeyValueStore({
                path: testUtil.storePathForOrg(orgName)
        }).then((store) => {
                client.setStateStore(store);
                client._userContext = null;
                return testUtil.getOrderAdminSubmitter(client, org, svcFile)
        }).then((admin) => {
                console.log('[joinChannel:%s] Successfully enrolled orderer \'admin\'', org);
                the_user = admin;
                console.log('[joinChannel] orderer admin: ', admin);

                tx_id = client.newTransactionID();
                var request = {
                        txId :  tx_id
                };
                return channel.getGenesisBlock(request);
        }).then((block) =>{
                console.log('[joinChannel:org=%s:%s] Successfully got the genesis block', channelName, org);
                genesis_block = block;

                client._userContext = null;
                return testUtil.getSubmitter(username, secret, client, true, org, svcFile);
        }).then((admin) => {
                console.log('[joinChannel] Successfully enrolled org:' + org + ' \'admin\'');
                the_user = admin;
                console.log('[joinChannel] org admin: ', admin);

                // add peers and events
                channelAddPeerEventJoin(channel, client, org);

                var eventPromises = [];

                eventHubs.forEach((eh) => {
                        let txPromise = new Promise((resolve, reject) => {
                                let handle = setTimeout(reject, 30000);

                                eh.registerBlockEvent((block) => {
                                        clearTimeout(handle);

                                        // in real-world situations, a peer may have more than one channels so
                                        // we must check that this block came from the channel we asked the peer to join
                                        if(block.data.data.length === 1) {
                                                // Config block must only contain one transaction
                                                var channel_header = block.data.data[0].payload.header.channel_header;

                                                if (channel_header.channel_id === channelName) {
                                                        console.log('[joinChannel] The new channel has been successfully joined on peer '+ eh.getPeerAddr());
                                                        resolve();
                                                } else {
                                                        //console.log('[joinChannel] The new channel has not been succesfully joined');
                                                        //reject();
                                                }
                                        }
                                }, (err) => {
                                    console.log('[joinChannel] Failed to registerBlockEvent due to error: ' + err.stack ? err.stack : err);
                                    throw new Error('[joinChannel] Failed to registerBlockEvent due to error: ' + err.stack ? err.stack : err);
                                });
                        }, (err) => {
                            console.log('[joinChannel] Failed to Promise due to error: ' + err.stack ? err.stack : err);
                            throw new Error('Failed to Promise due to error: ' + err.stack ? err.stack : err);
                        });

                        eventPromises.push(txPromise);
                });

                tx_id = client.newTransactionID();
                let request = {
                        targets : targets,
                        block : genesis_block,
                        txId :  tx_id
                };

                var sendPromise = channel.joinChannel(request);
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
                        throw new Error('[joinChannel] Failed to join channel');
                }
        }, (err) => {
                console.log('[joinChannel] Failed to join channel due to error: ' + err.stack ? err.stack : err);
                evtDisconnect();
        });
}

function joinOneChannel(channel, client, org) {
        console.log('[joinOneChannel] org: ', org);

        joinChannel(channel, client, org)
        .then(() => {
                console.log('[joinOneChannel] Successfully joined peers in organization %s to join the channel %s', ORGS[org].name, channelName);
                process.exit();
        }, (err) => {
                console.log(util.format('[joinOneChannel] Failed to join peers in organization "%s" to the channel', ORGS[org].name));
                process.exit();
        })
        .catch(function(err) {
                console.log('[joinOneChannel] Failed to join channel: ' + err);
                process.exit();
        });

}

// performance main
function performance_main() {
    // send proposal to endorser
    for (i=0; i<channelOrgName.length; i++ ) {
        org = channelOrgName[i];
        orgName=ORGS[org].name;
        console.log('[performance_main] org= %s, org Name= %s', org, orgName);
        var client = new hfc();

        if ( transType.toUpperCase() == 'INSTALL' ) {
            var username = ORGS[org].username;
            var secret = ORGS[org].secret;
            console.log('[performance_main] Deploy: user= %s, secret= %s', username, secret);

            hfc.newDefaultKeyValueStore({
                path: testUtil.storePathForOrg(orgName)
            })
            .then((store) => {
                client.setStateStore(store);
                testUtil.getSubmitter(username, secret, client, true, org, svcFile)
                .then(
                    function(admin) {
                        console.log('[performance_main:Nid=%d] Successfully enrolled user \'admin\'', Nid);
                        the_user = admin;
                        var channel = client.newChannel(channelName);
                        chaincodeInstall(channel, client, org);
                    },
                    function(err) {
                        console.log('[Nid=%d] Failed to wait due to error: ', Nid, err.stack ? err.stack : err);
                        evtDisconnect();

                        return;
                    }
                );
            }, (err) => {
                console.log('[Nid=%d] Failed to install chaincode on org(%s) to error: ', Nid, org, err.stack ? err.stack : err);
                evtDisconnect();
            });
        } else if ( transType.toUpperCase() == 'INSTANTIATE' ) {
            var username = ORGS[org].username;
            var secret = ORGS[org].secret;
            console.log('[performance_main] Deploy: user= %s, secret= %s', username, secret);

            hfc.setConfigSetting('request-timeout', 60000);
            hfc.newDefaultKeyValueStore({
                path: testUtil.storePathForOrg(orgName)
            })
            .then((store) => {
                client.setStateStore(store);
                testUtil.getSubmitter(username, secret, client, true, org, svcFile)
                .then(
                    function(admin) {
                        console.log('[performance_main:Nid=%d] Successfully enrolled user \'admin\'', Nid);
                        the_user = admin;
                        var channel = client.newChannel(channelName);
                        chaincodeInstantiate(channel, client, org);
                    },
                    function(err) {
                        console.log('[Nid=%d] Failed to wait due to error: ', Nid, err.stack ? err.stack : err);
                        evtDisconnect();

                        return;
                    }
                );
            });
        } else if ( transType.toUpperCase() == 'CHANNEL' ) {
            if ( channelOpt.action.toUpperCase() == 'CREATE' ) {
                createOneChannel(client, org);
            } else if ( channelOpt.action.toUpperCase() == 'JOIN' ) {
                var channel = client.newChannel(channelName);
                console.log('[performance_main] channel name: ', channelName);
                joinChannel(channel, client, org);
            }
        } else if ( transType.toUpperCase() == 'INVOKE' ) {
            // spawn off processes for transactions
            for (var j = 0; j < nProc; j++) {
                var workerProcess = child_process.spawn('node', ['./pte-execRequest.js', j, Nid, uiFile, tStart, org]);

                workerProcess.stdout.on('data', function (data) {
                    console.log('stdout: ' + data);
                });

                workerProcess.stderr.on('data', function (data) {
                    console.log('stderr: ' + data);
                });

                workerProcess.on('close', function (code) {
                });
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
