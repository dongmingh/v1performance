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
 *      node perf-main.js <ui file> <Nid>
 *        - ui file: user input file
 *        - Nid: Network id
 */
// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

var tape = require('tape');
//var _test = require('tape-promise');
//var test = _test(tape);

var log4js = require('log4js');
var logger = log4js.getLogger('E2E');
logger.setLevel('ERROR');

var path = require('path');

var hfc = require('hfc');
hfc.setLogger(logger);
var X509 = require('jsrsasign').X509;

var util = require('util');
var testUtil = require('./util.js');
var utils = require('hfc/lib/utils.js');
var Peer = require('hfc/lib/Peer.js');
var Orderer = require('hfc/lib/Orderer.js');
var FabricCOPServices = require('hfc-cop/lib/FabricCOPImpl');
var FabricCOPClient = FabricCOPServices.FabricCOPClient;
var User = require('hfc/lib/User.js');
var Client = require('hfc/lib/Client.js');

var keyValStorePath = testUtil.KVS;
console.log('keyValStorePath', testUtil.KVS);

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

var svcFile = uiContent.SCFile[Nid].ServiceCredentials;
var network = JSON.parse(fs.readFileSync(svcFile, 'utf8'));
var peers = network.credentials.peers;
var users = network.credentials.users;
var cop = network.credentials.cop;
var orderer = network.credentials.orderer;

//var chaincode_id = uiContent.chaincodeID; 
//set Member Services URL
var cop_id = Object.keys(network.credentials.cop);
var cop_url = 'http://' + cop[cop_id].discovery_host + ':' + cop[cop_id].discovery_port;
console.log('[Nid=%d] cop url: ', Nid, cop_url);
var csr = fs.readFileSync(path.resolve(__dirname, '../fixtures/fabriccop/enroll-csr.pem'));

function setStaticCSR(uid) {
    console.log('setStaticCSR ');
    var COPClient = new FabricCOPClient({
          protocol: 'http',
          hostname: cop[cop_id].discovery_host,
          port: cop[cop_id].discovery_port
    });

    COPClient.enroll( users[uid].username, users[uid].secret, csr.toString())
    .then(
        function (pem) {
            var cert = new X509();
            cert.readCertPEM(pem);
            console.log('Successfully enrolled \'' + users[uid].username + '\'');
            console.log('cert getSubjectString: ', cert.getSubjectString());
        }),
        function (err) {
            console.log('failed to enroll \'' + users[uid].username + '\'');
    };
}

//set COP
function setDynamicCSR(uid) {
    console.log('setDynamicCSR ');
    var copService = new FabricCOPServices(cop_url);
    copService.enroll({ 
        enrollmentID: users[uid].username,
        enrollmentSecret: users[uid].secret
    })
    .then(
        function (enrollment) {
            var cert = new X509();
            cert.readCertPEM(enrollment.certificate);
            console.log('SubjectString: ', cert.getSubjectString());
            console.log('Successfully enrolled \'' + users[uid].username + '\'' );
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
var chaincode_id = 'end2end';
var chain_id = 'test_chainid';
var tx_id = null;
var nonce = null;


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
        tmp = 'grpc://' + orderer[nOrderer-1].discovery_host + ":" + orderer[nOrderer-1].discovery_port;
        console.log('[Nid=%d] orderer url: ', Nid, tmp);
        chain.addOrderer(new Orderer(tmp));
/*
    for (i=0; i<nOrderer; i++) {
        tmp = 'grpc://' + orderer[i].discovery_host + ":" + orderer[i].discovery_port;
        console.log('[Nid=%d] orderer url: ', Nid, tmp);
        chain.addOrderer(new Orderer(tmp));
    }
*/


    tx_id = utils.buildTransactionID({length:12});
    nonce = utils.getNonce();
    var request_deploy = {
        chaincodePath: uiContent.deploy.chaincodePath,
        chaincodeId: chaincode_id,
        fcn: uiContent.deploy.fcn,
        args: testDeployArgs,
        chainId: chain_id,
        txId: tx_id,
        nonce: nonce,
        'dockerfile-contents' :
        'from hyperledger/fabric-ccenv\n' +
        'COPY . $GOPATH/src/build-chaincode/\n' +
        'WORKDIR $GOPATH\n\n' +
        'RUN go install build-chaincode && mv $GOPATH/bin/build-chaincode $GOPATH/bin/%s'
    };

    chain.sendDeploymentProposal(request_deploy)
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
                return chain.sendTransaction(request);
            } else {
                console.log('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
            }
        },
        function(err) {
            console.log('[Nid=%d] Failed to send deployment proposal due to error: ', Nid, err.stack ? err.stack : err);
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

// performance main
function performance_main() {
    // send proposal to endorser
    if ( transType.toUpperCase() == 'DEPLOY' ) {
        chain = client.newChain('testChain-e2e');
        //console.log('getChain------------: ', client.getChain('testChain-e2e'));
        userEnroll(2);

        sleep(2000);

/*
        hfc.newDefaultKeyValueStore({
            path: keyValStorePath
        }).then(
            function (store) {
                client.setStateStore(store);
*/

        testUtil.getSubmitter(client, null, true)
        .then(
            function(admin) {
                console.log('[Nid=%d] Successfully enrolled user \'admin\'', Nid);
                webUser = admin;
                deploy_chaincode();
            },
            function(err) {
                console.log('[Nid=%d] Failed to wait due to error: ', Nid, err.stack ? err.stack : err);
                return;
            }
        );
        //});
    } else if ( transType.toUpperCase() == 'INVOKE' ) {
        // spawn off processes for transactions
        for (var j = 0; j < nThread; j++) {
            var workerProcess = child_process.spawn('node', ['./perf-execRequest.js', j, Nid, uiFile, tStart]);

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
