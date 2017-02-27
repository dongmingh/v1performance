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

//var tape = require('tape');
//var _test = require('tape-promise');
//var test = _test(tape);

var log4js = require('log4js');
var logger = log4js.getLogger('E2E');
logger.setLevel('DEBUG');

var path = require('path');

var hfc = require('fabric-client');
hfc.setLogger(logger);
var X509 = require('jsrsasign').X509;

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

var keyValStorePath = testUtil.KVS;
console.log('keyValStorePath', keyValStorePath);

var client = new hfc();
utils.setConfigSetting('crypto-keysize', 256);

var fs = require('fs');
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

var svcFile = uiContent.SCFile[0].ServiceCredentials;
var network = JSON.parse(fs.readFileSync(svcFile, 'utf8'));
var peers = network.credentials.peers;
var users = network.credentials.users;
var ca = network.credentials.ca;
var orderer = network.credentials.orderer;

//set Member Services URL
var ca_id = Object.keys(network.credentials.ca);
var ca_url = 'http://' + ca[ca_id].discovery_host + ':' + ca[ca_id].discovery_port;
console.log('[Nid=%d] ca url: ', Nid, ca_url);
var csr = fs.readFileSync(path.resolve(__dirname, '/root/gopath/src/github.com/hyperledger/fabric-sdk-node/test/fixtures/fabriccop/enroll-csr.pem'));

var evtHub = network.credentials.evtHub;
var evtHub_id = Object.keys(network.credentials.evtHub);
var evtHub_url = 'grpc://' + evtHub[evtHub_id].discovery_host + ':' + evtHub[evtHub_id].discovery_port;
console.log('[Nid=%d] evtHub url: ', Nid, evtHub_url);

function setStaticCSR(uid) {
    console.log('setStaticCSR ');
    var CAClient = new FabricCAClient({
          protocol: 'http',
          hostname: ca[ca_id].discovery_host,
          port: ca[ca_id].discovery_port
    });

    CAClient.enroll( users[uid].username, users[uid].secret, csr.toString())
    .then(
        function (pem) {
            var cert = new X509();
            cert.readCertPEM(pem);
            console.log('cert getSubjectString: ', cert.getSubjectString());
            console.log('setStaticCSR: Successfully enrolled \'' + users[uid].username + '\'');
        }),
        function (err) {
            console.log('failed to enroll \'' + users[uid].username + '\'');
    };
}

//set COP
function setDynamicCSR(uid) {
    console.log('setDynamicCSR ');
    var caService = new FabricCAServices(ca_url);
    var member;
    caService.enroll({ 
        enrollmentID: users[uid].username,
        enrollmentSecret: users[uid].secret
    }
    ).then(
        function (enrollment) {
            var cert = new X509();
            cert.readCertPEM(enrollment.certificate);
            console.log('SubjectString: ', cert.getSubjectString());
            console.log('setDynamicCSR: Successfully enrolled \'' + users[uid].username + '\'' );
        },
        function (err) {
            console.log('Failed to enroll \'' + users[uid].username + '\'.  ' + err);
        }
    );
}

function userEnroll(uid) {
    console.log('user %d: ', uid, users[uid].username, users[uid].secret);
    hfc.newDefaultKeyValueStore({
        path: keyValStorePath
    })
    .then(
        function(store) {
            client.setStateStore(store);

            //setStaticCSR(uid);
            setDynamicCSR(uid);
        }
    );
}


var transType = uiContent.transType;
var nRequest = parseInt(uiContent.nRequest);
var nThread = parseInt(uiContent.nThread);
var tCurr;


//var testDeployArgs = uiContent.invoke.args.split(",");
var testDeployArgs = [];
for (i=0; i<uiContent.deploy.args.length; i++) {
    testDeployArgs.push(uiContent.deploy.args[i]);
}

//    console.log('chaincode path: ', testUtil.CHAINCODE_PATH);
//    console.log('chaincode path: ', uiContent.deploy.chaincodePath);
var tx_id = null;
var nonce = null;

var the_user;

// test begins ....
performance_main();

// deploy_chaincode
function deploy_chaincode() {
    //grpc endpoints
    var g = [];
    for (i=0; i<peers.length; i++) {
        tmp = 'grpc://' + peers[i].discovery_host + ":" + peers[i].discovery_port;
        g.push(tmp);
    }

    var g_len = nThread;
    if ( nThread > peers.length ) {
        g_len = peers.length;
    }

    for (i=0; i<g_len; i++) {
        console.log('peer ', g[i]);
        chain.addPeer(new Peer(g[i]));
    }

    //set Orderer URL
    var nOrderer = parseInt(uiContent.nOrderer);
    if ( nOrderer > orderer.length ) {
        console.log('nOrderer: %d is greater than orderer.length: %d', nOrderer, orderer.length);
        process.exit();
    }
    tmp = 'grpc://' + orderer[0].discovery_host + ":" + orderer[0].discovery_port;
    console.log('[Nid=%d] orderer url: ', Nid, tmp);
    chain.addOrderer(new Orderer(tmp));

    // setup event hub to get notified when transactions are committed
    eh = new EventHub();
    eh.setPeerAddr(evtHub_url);
    eh.connect();
    console.log('[Nid=%d] eventHub connect: %s', Nid, evtHub_url);

    var chaincode_id = uiContent.chaincodeID;
    var chaincode_ver = uiContent.chaincodeVer;
    var chain_id = uiContent.chainID;
    console.log('[Nid=%d] chaincode_id: %s, chaincode_ver: %s, chain_id: %s', Nid, chaincode_id, chaincode_ver, chain_id);

    nonce = utils.getNonce();
    tx_id = chain.buildTransactionID(nonce, the_user);
    nonce = utils.getNonce();
    var request_install = {
        chaincodePath: uiContent.deploy.chaincodePath,
        chaincodeId: chaincode_id,
        chaincodeVersion: chaincode_ver,
        txId: tx_id,
        nonce: nonce
    };

    console.log('request_install: ', request_install);

    chain.sendInstallProposal(request_install)
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
                    logger.info('install proposal was good');
                } else {
                    logger.error('install proposal was bad');
                }
                all_good = all_good & one_good;
            }
                if (all_good) {
                    console.log(util.format('Successfully sent install Proposal and received ProposalResponse: Status - %s', proposalResponses[0].response.status));
                } else {
                    console.log('Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...');
                    process.exit();
                }

            nonce = utils.getNonce();
            tx_id = chain.buildTransactionID(nonce, the_user);
            var request_deploy = {
                chaincodePath: uiContent.deploy.chaincodePath,
                chaincodeId: chaincode_id,
                chaincodeVersion: chaincode_ver,
                fcn: uiContent.deploy.fcn,
                args: testDeployArgs,
                chainId: chain_id,
                txId: tx_id,
                nonce: nonce
            };

            console.log('request_deploy: ', request_deploy);
            return chain.sendInstantiateProposal(request_deploy);
        },
        function(err) {
            console.log('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
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
                    logger.info('deploy proposal was good');
                } else {
                    logger.error('deploy proposal was bad');
                }
                all_good = all_good & one_good;
            }
            if (all_good) {
                console.log(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
                var request = {
                    proposalResponses: proposalResponses,
                    proposal: proposal,
                    header: header
                };

                var deployId = tx_id.toString();
                var txPromise = new Promise((resolve, reject) => {
                    var handle = setTimeout(reject, 30000);

                    eh.registerTxEvent(deployId, (tx) => {
                        console.log('The chaincode deploy transaction has been successfully committed');
                        clearTimeout(handle);
                        eh.unregisterTxEvent(deployId);

                    });
                });


                return chain.sendTransaction(request);
/*
                var sendPromise = chain.sendTransaction(request);
                return Promise.all([sendPromise, txPromise]).then((results) => {
                    return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
                }).catch((err) => {
                    console.log('Failed to send deploy transaction and get notifications within the timeout period. ' + err.stack ? err.stack : err);
                    eh.disconnect();
                });
*/
            } else {
                console.log('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
                eh.disconnect();
            }
        },
        function(err) {
            console.log('[Nid=%d] Failed to send deployment proposal due to error: ', Nid, err.stack ? err.stack : err);
            eh.disconnect();
        })
    .then(
        function(response) {
            if (response.status === 'SUCCESS') {
                console.log('[Nid=%d] Successfully ordered deployment endorsement... wait now for the committer to catch up', Nid);
                return sleep(20000);
            } else {
                console.log('[Nid=%d] Failed to order the deployment endorsement. Error code: ', Nid, response.status);
            }

        },
        function(err) {
            console.log('[Nid=%d] Failed to send deployment e due to error: ', Nid, err.stack ? err.stack : err);
        }
    );
}

var chain;
var eh;

// performance main
function performance_main() {
    // send proposal to endorser
    if ( transType.toUpperCase() == 'DEPLOY' ) {
        chain = client.newChain('testChain-e2e');
        var uid = 2;
        userEnroll(uid);
        console.log('complete userEnrollment');

        sleep(2000);

/*
        hfc.newDefaultKeyValueStore({
            path: keyValStorePath
        }).then(
            function (store) {
                client.setStateStore(store);
*/

        //testUtil.getSubmitter(client, null, true)
        testUtil.getSubmitter(users[uid].username, users[uid].secret, client, true)
        .then(
            function(admin) {
                console.log('[Nid=%d] Successfully enrolled user \'admin\'', Nid);
                the_user = admin;
                deploy_chaincode();
                sleep(30000);
                eh.disconnect();
            },
            function(err) {
                console.log('[Nid=%d] Failed to wait due to error: ', Nid, err.stack ? err.stack : err);
                eh.disconnect();

                return;
            }
        );
        //});
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
                //console.log('child process exited with code ' + code);
            });
        }
    } else {
        console.log('[Nid=%d] invalid transType: %s', Nid, transType);
    }
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function evtDisconnect() {
    if (eh && eh.isconnected()) {
        logger.info('Disconnecting the event hub');
        eh.disconnect();
    }
}
