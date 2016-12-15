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
 *      node perf-main.js <LPARid> <ui file>
 *        - LPARid: LPAR id
 *        - ui file: user input file
 */
// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

var tape = require('tape');
//var _test = require('tape-promise');
//var test = _test(tape);

var path = require('path');

var hfc = require('../..');
var util = require('util');
var grpc = require('grpc');
var testUtil = require('./util.js');
var utils = require('../../lib/utils.js');
var fs = require('fs');
const child_process = require('child_process');

var chain = hfc.newChain('testChain-e2e');
var webUser;
var tmp;
var i=0;
var chaincode_id = 'mycc1';

testUtil.setupChaincodeDeploy();

// need to override the default key size 384 to match the member service backend
// otherwise the client will not be able to decrypt the enrollment challenge
utils.setConfigSetting('crypto-keysize', 256);

// need to override the default hash algorithm (SHA3) to SHA2 (aka SHA256 when combined
// with the key size 256 above), in order to match what the peer and COP use
utils.setConfigSetting('crypto-hash-algo', 'SHA2');

chain.setKeyValueStore(hfc.newKeyValueStore({
	path: testUtil.KVS
}));


// input: userinput json file
var LPARid = parseInt(process.argv[2]);
var uiFile = process.argv[3];
var tStart = parseInt(process.argv[4]);
var uiContent = JSON.parse(fs.readFileSync(uiFile));
console.log('input parameters: LPARid=%d, uiFile=%s, tStart=%d', LPARid, uiFile, tStart);

var svcFile = uiContent.SCFile[LPARid].ServiceCredentials;
var network = JSON.parse(fs.readFileSync(svcFile, 'utf8'));
var peers = network.credentials.peers;
var users = network.credentials.users;
var cop = network.credentials.cop;
var orderer = network.credentials.orderer;

//set Member Services URL and Orderer URL
var cop_id = Object.keys(network.credentials.cop);
tmp = 'http://' + cop[cop_id].discovery_host + ':' + cop[cop_id].discovery_port;
console.log('[LPARid=%d] cop url: ', LPARid, tmp);
chain.setMemberServicesUrl(tmp);
var orderer_id = Object.keys(network.credentials.orderer);
tmp = 'grpc://' + orderer[orderer_id].discovery_host + ':' + orderer[orderer_id].discovery_port;
console.log('[LPARid=%d] orderer url: ', LPARid, tmp);
chain.setOrderer(tmp);


//var chaincode_id = uiContent.chaincodeID; 
var transType = uiContent.transType;
var nRequest = parseInt(uiContent.nRequest);
var nThread = parseInt(uiContent.nThread);
var tCurr;

//grpc endpoints
var g = [];
for (i=0; i<peers.length; i++) {
    tmp = 'grpc://' + peers[i].discovery_host + ":" + peers[i].discovery_port;
    g.push(tmp);
}

var grpcArgs = [];
var g_len = nThread;
if ( nThread > peers.length ) {
    g_len = peers.length;
}
console.log('g_len ', g_len);
//for (i=0; i<peers.length; i++) {
for (i=0; i<g_len; i++) {
    grpcArgs.push(hfc.getPeer(g[i]));
}


//var testDeployArgs = uiContent.invoke.args.split(",");
var testDeployArgs = [];
for (i=0; i<uiContent.deploy.args.length; i++) {
    testDeployArgs.push(uiContent.deploy.args[i]);
}

var request_deploy = {
    targets: grpcArgs,
    chaincodePath: testUtil.CHAINCODE_PATH,
    chaincodeId: chaincode_id,
    fcn: uiContent.deploy.fcn,
    args: testDeployArgs,
    'dockerfile-contents' :
    'from hyperledger/fabric-ccenv\n' +
    'COPY . $GOPATH/src/build-chaincode/\n' +
    'WORKDIR $GOPATH\n\n' +
    'RUN go install build-chaincode && mv $GOPATH/bin/build-chaincode $GOPATH/bin/%s'
};


// test begins ....
performance_main();

// deploy_chaincode
function deploy_chaincode() {

    webUser.sendDeploymentProposal(request_deploy)
    .then(
        function(results) {
            var proposalResponses = results[0];
            //console.log('proposalResponses:'+JSON.stringify(proposalResponses));
            var proposal = results[1];
            if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
                console.log(util.format('[LPARid=%d] Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', LPARid, proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
                return webUser.sendTransaction(proposalResponses, proposal);
            } else {
                console.log('[LPARid=%d] Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...', LPARid);
            }
        },
        function(err) {
            console.log('[LPARid=%d] Failed to send deployment proposal due to error: ', LPARid, err.stack ? err.stack : err);
        })
    .then(
        function(response) {
            if (response.Status === 'SUCCESS') {
                console.log('[LPARid=%d] Successfully ordered deployment endorsement... wait now for the committer to catch up', LPARid);
                return sleep(20000);
            } else {
                console.log('[LPARid=%d] Failed to order the deployment endorsement. Error code: ', LPARid, response.status);
            }

        },
        function(err) {
            console.log('[LPARid=%d] Failed to send deployment e due to error: ', LPARid, err.stack ? err.stack : err);
        }
    );
}


// performance main
function performance_main() {
    i = 0;
    chain.enroll(users[0].username, users[0].secret)
    .then(
        function(admin) {
            console.log('[LPARid=%d] Successfully enrolled user \'admin\'', LPARid);
            webUser = admin;

            // send proposal to endorser
            if ( transType.toUpperCase() == 'DEPLOY' ) {
                deploy_chaincode();
            } else if ( transType.toUpperCase() == 'INVOKE' ) {
                console.log('[LPARid=%d] ordered deployment endorsement.', LPARid);
                // Start the transactions
                for (var j = 0; j < nThread; j++) {
                    var workerProcess = child_process.spawn('node', ['./perf-execRequest.js', j, LPARid, uiFile, tStart]);

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
                console.log('[LPARid=%d] invalid transType: %s', LPARid, transType);
            }
        },
        function(err) {
            console.log('[LPARid=%d] Failed to wait due to error: ', LPARid, err.stack ? err.stack : err);
            return;
        }
    );
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

