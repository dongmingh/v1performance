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
logger.setLevel('DEBUG');

var path = require('path');

var hfc = require('hfc');
hfc.setLogger(logger);

var util = require('util');
var testUtil = require('./util.js');
var utils = require('hfc/lib/utils.js');
var Peer = require('hfc/lib/Peer.js');
var Orderer = require('hfc/lib/Orderer.js');
var FabricCOPServices = require('hfc-cop/lib/FabricCOPImpl');
var User = require('hfc/lib/User.js');
var Client = require('hfc/lib/Client.js');

var keyValStorePath = testUtil.KVS;
console.log('keyValStorePath', testUtil.KVS);

var client = new hfc();
var chain = client.newChain('testChain-e2e');
utils.setConfigSetting('crypto-keysize', 256);
client.setStateStore(hfc.newDefaultKeyValueStore({
        path: keyValStorePath
}));



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

function userEnroll(uid) {
    console.log('user %d: ', uid, users[uid].username, users[uid].secret);
    //set COP
    var copService = new FabricCOPServices(cop_url);
    copService.enroll({ 
        enrollmentID: users[0].username, 
        enrollmentSecret: users[0].secret
    })
    .then(
        function(admin) {
            var member = new User('admin', chain);
            member.setEnrollment(admin.key, admin.certificate);
            return client.setUserContext(member);
        },
        function(err) {
            console.log('failed to enroll admin with COP server, error: ', +err);
        }
    ).then(
        function(user) {
            if (user.getName() == 'admin') {
                console.log('successfully loaded admin from key value store');
            }
        },
        function(err) {
            console.log('failed to load the user admin from key value store, error: ', +err);
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
var chaincode_id = 'mycc1';
var chain_id = '**TEST_CHAINID**';
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
        console.log('nOrderer: %d is greater than orderere.length: %d', nOrderer, orderer.length);
        process.exit();
    }
    for (i=0; i<nOrderer; i++) {
        tmp = 'grpc://' + orderer[i].discovery_host + ":" + orderer[i].discovery_port;
        console.log('[Nid=%d] orderer url: ', Nid, tmp);
        chain.addOrderer(new Orderer(tmp));
    }

    //enroll user
    userEnroll(0);

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
            if (response.Status === 'SUCCESS') {
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


// performance main
function performance_main() {
    // send proposal to endorser
    if ( transType.toUpperCase() == 'DEPLOY' ) {
        testUtil.getSubmitter(client)
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
