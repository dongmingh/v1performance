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
 *      node perf-execRequest.js pid Nid uiFile tStart
 *        - action: deploy, invoke, query
 *        - recurrence: integer number
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

//var grpc = require('grpc');

var util = require('util');
var testUtil = require('./util.js');
var utils = require('hfc/lib/utils.js');
var Peer = require('hfc/lib/Peer.js');
var Orderer = require('hfc/lib/Orderer.js');
var FabricCOPServices = require('hfc-cop/lib/FabricCOPImpl');
var User = require('hfc/lib/User.js');
var Client = require('hfc/lib/Client.js');
var fs = require('fs');
const crypto = require('crypto');

var client = new hfc();
var chain = client.newChain('testChain-e2e');
utils.setConfigSetting('crypto-keysize', 256);
var keyValStorePath = testUtil.KVS;

// local vars
var webUser;
var tmp;
var tCurr;
var tEnd;
var tLocal;
var i = 0;
var inv_m = 0;    // counter of invoke move
var inv_q = 0;    // counter of invoke query
var IDone=0;
var QDone=0;
var recHist;
var buff;
var ofile;
var chaincode_id = 'end2end';
var chain_id = 'test_chainid';
var tx_id = null;
var nonce = null;

testUtil.setupChaincodeDeploy();

// need to override the default key size 384 to match the member service backend
// otherwise the client will not be able to decrypt the enrollment challenge
utils.setConfigSetting('crypto-keysize', 256);

// need to override the default hash algorithm (SHA3) to SHA2 (aka SHA256 when combined
// with the key size 256 above), in order to match what the peer and COP use
utils.setConfigSetting('crypto-hash-algo', 'SHA2');

//input args
var pid = parseInt(process.argv[2]);
var Nid = parseInt(process.argv[3]);
var uiFile = process.argv[4];
var tStart = parseInt(process.argv[5]);
console.log('[Nid:id=%d:%d] input parameters: Nid=%d, uiFile=%s, tStart=%d', Nid, pid, Nid, uiFile, tStart);
var uiContent = JSON.parse(fs.readFileSync(uiFile));

var svcFile = uiContent.SCFile[Nid].ServiceCredentials;
var network = JSON.parse(fs.readFileSync(svcFile, 'utf8'));
var peers = network.credentials.peers;
var users = network.credentials.users;
var cop = network.credentials.cop;
var orderer = network.credentials.orderer;

var cop_id = Object.keys(network.credentials.cop);
var cop_url = 'http://' + cop[cop_id].discovery_host + ':' + cop[cop_id].discovery_port;
console.log('[Nid=%d] cop url: ', Nid, cop_url);

//user parameters
//var chaincode_id = uiContent.chaincodeID;
var transMode = uiContent.transMode;
var transType = uiContent.transType;
var invokeType = uiContent.invokeType;
var nRequest = parseInt(uiContent.nRequest);
var nPeer = parseInt(uiContent.nPeer);
var nOrderer = parseInt(uiContent.nOrderer);
console.log('[Nid:id=%d:%d] nOrderer: %d, nPeer: %d, transMode: %s, transType: %s, invokeType: %s, nRequest: %d', Nid, pid, nOrderer, nPeer, transMode, transType, invokeType, nRequest);

var runDur=0;
if ( nRequest == 0 ) {
   runDur = parseInt(uiContent.runDur);
   console.log('[Nid:id=%d:%d] nOrderer: %d, nPeer: %d, transMode: %s, transType: %s, invokeType: %s, runDur: %d', Nid, pid, nOrderer, nPeer, transMode, transType, invokeType, runDur);
   // convert runDur to ms
   runDur = 1000*runDur;
}

//add orderer
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


//var g = ['grpc://10.120.223.35:7051', 'grpc://10.120.223.35:7052', 'grpc://10.120.223.35:7053'];
var g = [];
for (i=0; i<peers.length; i++) {
    tmp = 'grpc://' + peers[i].discovery_host + ":" + peers[i].discovery_port;
    g.push(tmp);
}

chain.addPeer(new Peer(g[pid % nPeer]));
console.log('[Nid:id=%d:%d] peer url: %s', Nid, pid, g[pid % nPeer]);


var ccType = uiContent.ccType;
var keyStart=0;
var payLoadMin=0;
var payLoadMax=0;
var arg0=0;

if ( ccType == 'ccchecker') {
    keyStart = parseInt(uiContent.ccOpt.keyStart);
    payLoadMin = parseInt(uiContent.ccOpt.payLoadMin)/2;
    payLoadMax = parseInt(uiContent.ccOpt.payLoadMax)/2;
    arg0 = keyStart;
    console.log('Nid:id=%d:%d, ccchecker chaincode setting: keyStart=%d payLoadMin=%d payLoadMax=%d',
                 Nid, pid, keyStart, parseInt(uiContent.ccOpt.payLoadMin), parseInt(uiContent.ccOpt.payLoadMax));
}
console.log('ccType: %s, keyStart: %d', ccType, keyStart);
//construct invoke request
var testInvokeArgs = [];
for (i=0; i<uiContent.invoke.move.args.length; i++) {
    testInvokeArgs.push(uiContent.invoke.move.args[i]);
}

var request_invoke;
function getMoveRequest() {
    if ( ccType == 'ccchecker') {
        arg0 ++;
        testInvokeArgs[1] = 'key'+pid+'_'+arg0;
        // random payload
        var r = Math.floor(Math.random() * (payLoadMax - payLoadMin)) + payLoadMin;

        var buf = crypto.randomBytes(r);
        testInvokeArgs[2] = buf.toString('hex');

        //console.log('Nid:id=%d:%d, key: %s, r: %d', Nid, pid, testInvokeArgs[1], r);
    }

    request_invoke = {
        chaincodeId : chaincode_id,
        chainId: chain_id,
        txId: utils.buildTransactionID(),
        nonce: utils.getNonce(),
        fcn: uiContent.invoke.move.fcn,
        args: testInvokeArgs
    };

   //console.log('request_invoke: ', request_invoke);
}

//construct query request
var testQueryArgs = [];
for (i=0; i<uiContent.invoke.query.args.length; i++) {
    testQueryArgs.push(uiContent.invoke.query.args[i]);
}

var request_query;
function getQueryRequest() {
    if ( ccType == 'ccchecker') {
        arg0 ++;
        testQueryArgs[1] = 'key'+pid+'_'+arg0;
    }

    request_query = {
        chaincodeId : chaincode_id,
        chainId: chain_id,
        txId: utils.buildTransactionID(),
        nonce: utils.getNonce(),
        fcn: uiContent.invoke.query.fcn,
        args: testQueryArgs
    };

    //console.log('request_query: ', request_query);
}

/*
 *   transactions begin ....
 */
    execTransMode();

function execTransMode() {

    // init vars
    inv_m = 0;
    inv_q = 0;

    //enroll user
    hfc.newDefaultKeyValueStore({
        path: keyValStorePath
    }).then(
        function (store) {
            client.setStateStore(store);

            testUtil.getSubmitter(client, null, true)
            .then(
                function(admin) {
                    console.log('[Nid:id=%d:%d] Successfully loaded user \'admin\'', Nid, pid);
                    webUser = admin;

	            tCurr = new Date().getTime();
	            console.log('[Nid:id=%d:%d] execTransMode: tCurr= %d, tStart= %d, time to wait=%d', Nid, pid, tCurr, tStart, tStart-tCurr);
                    // execute transactions
                    setTimeout(function() {
                        if (transMode.toUpperCase() == 'SIMPLE') {
                            execModeSimple();
                        } else if (transMode.toUpperCase() == 'CONSTANT') {
                            execModeConstant();
                        } else if (transMode.toUpperCase() == 'MIX') {
                            execModeMix();
                        } else if (transMode.toUpperCase() == 'BURST') {
                            execModeBurst();
                        } else {
                            // invalid transaction request
                            console.log(util.format("Nid:id=%d:%d, Transaction %j and/or mode %s invalid", Nid, pid, transType, transMode));
                            process.exit(1);
                        }
                    }, tStart-tCurr);
                },
                function(err) {
                    console.log('[Nid:id=%d:%d] Failed to wait due to error: ', Nid, pid, err.stack ? err.stack : err);
                    return;
                }
            );
        });
}

function isExecDone(trType){
    tCurr = new Date().getTime();
    if ( trType.toUpperCase() == 'MOVE' ) {
        if ( nRequest > 0 ) {
           if ( (inv_m % (nRequest/10)) == 0 ) {
              console.log(util.format("[Nid:id=%d:%d] invokes(%s) sent: number=%d, elapsed time= %d",
                                         Nid, pid, trType, inv_m, tCurr-tLocal));
           }

           if ( inv_m >= nRequest ) {
                IDone = 1;
           }
        } else {
           if ( (inv_m % 1000) == 0 ) {
              console.log(util.format("[Nid:id=%d:%d] invokes(%s) sent: number=%d, elapsed time= %d",
                                         Nid, pid, trType, inv_m, tCurr-tLocal));
           }

           if ( tCurr > tEnd ) {
                console.log(util.format("[Nid:id=%d:%d] invoke completes: tCurr=%d, tEnd= %d", tCurr, tEnd));
                IDone = 1;
           }
        }
    } else if ( trType.toUpperCase() == 'QUERY' ) {
        if ( nRequest > 0 ) {
           if ( (inv_q % (nRequest/10)) == 0 ) {
              console.log(util.format("[Nid:id=%d:%d] invokes(%s) sent: number=%d, elapsed time= %d",
                                         Nid, pid, trType, inv_q, tCurr-tLocal));
           }

           if ( inv_q >= nRequest ) {
                QDone = 1;
           }
        } else {
           if ( (inv_q % 1000) == 0 ) {
              console.log(util.format("[Nid:id=%d:%d] invokes(%s) sent: number=%d, elapsed time= %d",
                                         Nid, pid, trType, inv_q, tCurr-tLocal));
           }

           if ( tCurr > tEnd ) {
                QDone = 1;
           }
        }
    }


}


var txRequest;
function getTxRequest(results) {
    txRequest = {
        proposalResponses: results[0],
        proposal: results[1],
        header: results[2]
    };
}

// invoke_move_simple
function invoke_move_simple(freq) {
    inv_m++;

    getMoveRequest();
    chain.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            //var proposal = results[1];
            //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            getTxRequest(results);
            if (proposalResponses[0].response.status === 200) {
                return chain.sendTransaction(txRequest);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[Nid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', Nid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.status === 'SUCCESS') {
                isExecDone('Move');
                if ( IDone != 1 ) {
                    setTimeout(function(){
                        invoke_move_simple(freq);
                    },freq);
                } else {
                    tCurr = new Date().getTime();
                    console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
            } else {
                console.log('[Nid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', Nid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}




// invoke_query_simple
function invoke_query_simple(freq) {
    inv_q++;

    getQueryRequest();
    chain.queryByChaincode(request_query)
    .then(
        function(response_payloads) {
            isExecDone('Query');
            if ( QDone != 1 ) {
                setTimeout(function(){
                    invoke_query_simple(freq);
                },freq);
            } else {
                tCurr = new Date().getTime();
                for(let j = 0; j < response_payloads.length; j++) {
                    console.log('[Nid:id=%d:%d] query result:', Nid, pid, response_payloads[j].toString('utf8'));
                }
                console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                //return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send query due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }
    );

}

function execModeSimple() {

    // send proposal to endorser
    if ( transType.toUpperCase() == 'INVOKE' ) {
        tLocal = new Date().getTime();
        if ( runDur > 0 ) {
            tEnd = tLocal + runDur;
        }
        console.log('[Nid:id=%d:%d] tStart %d, tLocal %d', Nid, pid, tStart, tLocal);
        if ( invokeType.toUpperCase() == 'MOVE' ) {
            var freq = 20000;
            if ( ccType == 'ccchecker' ) {
                freq = 0;
            }
            invoke_move_simple(freq);
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_simple(0);
        }
    } else {
        console.log('[Nid:id=%d:%d] invalid transType= %s', Nid, pid, transType);
    }
}

var devFreq = parseInt(uiContent.constantOpt.devFreq);
function getRandom(min0, max0) {
        return Math.floor(Math.random() * (max0-min0)) + min0;
}
// invoke_move_const
function invoke_move_const(freq) {
    inv_m++;

    getMoveRequest();
    chain.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            //var proposal = results[1];
            getTxRequest(results);
            if (proposalResponses[0].response.status === 200) {
                return chain.sendTransaction(txRequest);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[Nid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', Nid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.status === 'SUCCESS') {
                // hist output
                if ( recHist == 'HIST' ) {
                    tCurr = new Date().getTime();
                    buff = Nid +':'+ pid + ' ' + transType[0] + ':' + inv_m + ' time:'+ tCurr + '\n';
                    fs.appendFile(ofile, buff, function(err) {
                        if (err) {
                           return console.log(err);
                        }
                    })
                }

                isExecDone('Move');
                if ( IDone != 1 ) {
                    var freq_n=getRandom(freq-devFreq, freq+devFreq);
                    //console.log(' getRandom(min0, max0): ', freq_n);
                    setTimeout(function(){
                        invoke_move_const(freq);
                    },freq_n);
                } else {
                    tCurr = new Date().getTime();
                    console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
            } else {
                console.log('[Nid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', Nid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}

// invoke_query_const
function invoke_query_const(freq) {
    inv_q++;

    getQueryRequest();
    chain.queryByChaincode(request_query)
    .then(
        function(response_payloads) {
            // output
            if ( recHist == 'HIST' ) {
                tCurr = new Date().getTime();
                buff = Nid +':'+ pid + ' ' + transType[0] + ':' + inv_q + ' time:'+ tCurr + '\n';
                fs.appendFile(ofile, buff, function(err) {
                    if (err) {
                       return console.log(err);
                    }
                })
            }
            isExecDone('Query');
            if ( QDone != 1 ) {
                var freq_n=getRandom(freq-devFreq, freq+devFreq);
                //console.log(' getRandom(min0, max0): ', freq_n);
                setTimeout(function(){
                    invoke_query_const(freq);
                },freq_n);
            } else {
                tCurr = new Date().getTime();
                for(let j = 0; j < response_payloads.length; j++) {
                    console.log('[Nid:id=%d:%d] query result:', Nid, pid, response_payloads[j].toString('utf8'));
                }
                console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                //return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send query due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }
    );

}
function execModeConstant() {

    // send proposal to endorser
    if ( transType.toUpperCase() == 'INVOKE' ) {
        if (uiContent.constantOpt.recHist) {
            recHist = uiContent.constantOpt.recHist.toUpperCase();
        }
        console.log('recHist: ', recHist);

        tLocal = new Date().getTime();
        if ( nRequest == 0 ) {
            tEnd = tLocal + runDur;
        }
        console.log('[Nid:id=%d:%d] tStart %d, tLocal %d tEnd %d', Nid, pid, tStart, tLocal, tEnd);
        var freq = parseInt(uiContent.constantOpt.constFreq);
        ofile = 'ConstantResults'+Nid+'.txt';
        //var ConstantFile = fs.createWriteStream('ConstantResults.txt');
        console.log('Nid:id=%d:%d, Constant Freq: %d ms', Nid, pid, freq);

        if ( invokeType.toUpperCase() == 'MOVE' ) {
            if ( ccType == 'general' ) {
                if ( freq < 20000 ) {
                    freq = 20000;
                }
            }
            invoke_move_const(freq);
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_const(freq);
        }
    } else {
        console.log('[Nid:id=%d:%d] invalid transType= %s', Nid, pid, transType);
    }
}

// mix mode
function invoke_move_mix(freq) {
    inv_m++;

    tCurr = new Date().getTime();
    //console.log('Nid:id=%d:%d, invoke_move_mix(): tCurr= %d, freq: %d', Nid, pid, tCurr, freq);

    getMoveRequest();
    chain.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            //var proposal = results[1];
            getTxRequest(results);
            if (proposalResponses[0].response.status === 200) {
                return chain.sendTransaction(txRequest);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[Nid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', Nid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.status === 'SUCCESS') {
                setTimeout(function(){
                    invoke_query_mix(freq);
                },freq);
            } else {
                console.log('[Nid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', Nid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}
// invoke_query_mix
function invoke_query_mix(freq) {
    inv_q++;

    tCurr = new Date().getTime();
    //console.log('Nid:id=%d:%d, invoke_query_mix(): tCurr= %d', Nid, pid, tCurr);

    getQueryRequest();
    chain.queryByChaincode(request_query)
    .then(
        function(response_payloads) {
                isExecDone('Move');
                if ( IDone != 1 ) {
                    invoke_move_mix(freq);
                } else {
                    for(let j = 0; j < response_payloads.length; j++) {
                        console.log('[Nid:id=%d:%d] query result:', Nid, pid, response_payloads[j].toString('utf8'));
                    }
                    tCurr = new Date().getTime();
                    console.log('[Nid:id=%d:%d] completed %d Invoke(move) and %d invoke(query) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, inv_q, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send query due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }
    );

}
function execModeMix() {

    // send proposal to endorser
    if ( transType.toUpperCase() == 'INVOKE' ) {
        tLocal = new Date().getTime();
        if ( runDur > 0 ) {
            tEnd = tLocal + runDur;
        }
        console.log('[Nid:id=%d:%d] tStart %d, tLocal %d', Nid, pid, tStart, tLocal);
        var freq = parseInt(uiContent.mixOpt.mixFreq);
        if ( ccType == 'general' ) {
            if ( freq < 20000 ) {
                freq = 20000;
            }
        }
        console.log('[Nid:id=%d:%d] Mix Freq: %d ms', Nid, pid, freq);
        invoke_move_mix(freq);
    } else {
        console.log('[Nid:id=%d:%d] invalid transType= %s', Nid, pid, transType);
    }
}


// Burst mode vars
var burstFreq0;
var burstDur0;
var burstFreq1;
var burstDur1;
var tDur=[];
var tFreq=[];
var tUpd0;
var tUpd1;
var bFreq;

function getBurstFreq() {

    tCurr = new Date().getTime();
    console.log('Nid:id=%d:%d, getBurstFreq(): tCurr= %d', Nid, pid, tCurr);

    // set up burst traffic duration and frequency
    if ( tCurr < tUpd0 ) {
        bFreq = tFreq[0];
    } else if ( tCurr < tUpd1 ) {
        bFreq = tFreq[1];
    } else {
        tUpd0 = tCurr + tDur[0];
        tUpd1 = tUpd0 + tDur[1];
        bFreq = tFreq[0];
    }

}

// invoke_move_burst
function invoke_move_burst() {
    inv_m++;

    // set up burst traffic duration and frequency
    getBurstFreq();

    getMoveRequest();
    chain.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            //var proposal = results[1];
            getTxRequest(results);
            if (proposalResponses[0].response.status === 200) {
                return chain.sendTransaction(txRequest);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[Nid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', Nid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.status === 'SUCCESS') {
                isExecDone('Move');
                if ( IDone != 1 ) {
                    setTimeout(function(){
                        invoke_move_burst();
                    },bFreq);
                } else {
                    tCurr = new Date().getTime();
                    console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
            } else {
                console.log('[Nid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', Nid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}

// invoke_query_burst
function invoke_query_burst() {
    inv_q++;

    // set up burst traffic duration and frequency
    getBurstFreq();

    getQueryRequest();
    chain.queryByChaincode(request_query)
    .then(
        function(response_payloads) {
            isExecDone('Query');
            if ( QDone != 1 ) {
                setTimeout(function(){
                    invoke_query_burst();
                },bFreq);
            } else {
                tCurr = new Date().getTime();
                for(let j = 0; j < response_payloads.length; j++) {
                    console.log('[Nid:id=%d:%d] query result:', Nid, pid, response_payloads[j].toString('utf8'));
                }
                console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                //return;
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send query due to error: ', Nid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
        }
    );

}
function execModeBurst() {

    // init TcertBatchSize
    burstFreq0 = parseInt(uiContent.burstOpt.burstFreq0);
    burstDur0 = parseInt(uiContent.burstOpt.burstDur0);
    burstFreq1 = parseInt(uiContent.burstOpt.burstFreq1);
    burstDur1 = parseInt(uiContent.burstOpt.burstDur1);
    tFreq = [burstFreq0, burstFreq1];
    tDur  = [burstDur0, burstDur1];

    console.log('Nid:id=%d:%d, Burst setting: tDur =',Nid, pid, tDur);
    console.log('Nid:id=%d:%d, Burst setting: tFreq=',Nid, pid, tFreq);

    // get time
    tLocal = new Date().getTime();

    tUpd0 = tLocal+tDur[0];
    tUpd1 = tLocal+tDur[1];
    bFreq = tFreq[0];

    // send proposal to endorser
    if ( transType.toUpperCase() == 'INVOKE' ) {
        tLocal = new Date().getTime();
        if ( runDur > 0 ) {
            tEnd = tLocal + runDur;
        }
        console.log('[Nid:id=%d:%d] tStart %d, tLocal %d', Nid, pid, tStart, tLocal);
        console.log('[Nid:id=%d:%d] Mix Freq: %d ms', Nid, pid, bFreq);
        if ( invokeType.toUpperCase() == 'MOVE' ) {
            invoke_move_burst();
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_burst();
        }
    } else {
        console.log('[Nid:id=%d:%d] invalid transType= %s', Nid, pid, transType);
    }
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

