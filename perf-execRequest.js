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
 *      node perf.js <action> <recurrence>
 *        - action: deploy, invoke, query
 *        - recurrence: integer number
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

var chain = hfc.newChain('testChain-e2e');

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

var pid = parseInt(process.argv[2]);
// input: userinput json file
var LPARid = parseInt(process.argv[3]);
var uiFile = process.argv[4];
var tStart = parseInt(process.argv[5]);
console.log('[LPAR:id=%d:%d] input parameters: LPARid=%d, uiFile=%s, tStart=%d', LPARid, pid, LPARid, uiFile, tStart);
var uiContent = JSON.parse(fs.readFileSync(uiFile));

var svcFile = uiContent.SCFile[LPARid].ServiceCredentials;
var network = JSON.parse(fs.readFileSync(svcFile, 'utf8'));
var peers = network.credentials.peers;
var users = network.credentials.users;
var cop = network.credentials.cop;
var orderer = network.credentials.orderer;

//set Member Services url and Orderer url
var cop_id = Object.keys(network.credentials.cop);
tmp = 'http://' + cop[cop_id].discovery_host + ':' + cop[cop_id].discovery_port;
console.log('[LPARid:id=%d:%d] cop url: %s', LPARid, pid, tmp);
chain.setMemberServicesUrl(tmp);
var orderer_id = Object.keys(network.credentials.orderer);
tmp = 'grpc://' + orderer[orderer_id].discovery_host + ':' + orderer[orderer_id].discovery_port;
console.log('[LPARid:id=%d:%d] orderer url: %s', LPARid, pid, tmp);
chain.setOrderer(tmp);

//user parameters
//var chaincode_id = uiContent.chaincodeID;
var transMode = uiContent.transMode;
var transType = uiContent.transType;
var invokeType = uiContent.invokeType;
var nRequest = parseInt(uiContent.nRequest);
var nPeers = parseInt(uiContent.nPeers);
var nOrderers = parseInt(uiContent.nOrderers);
console.log('[LPARid:id=%d:%d] nOrderers: %d, nPeers: %d, transMode: %s, transType: %s, invokeType: %s, nRequest: %d', LPARid, pid, nOrderers, nPeers, transMode, transType, invokeType, nRequest);

var runDur=0;
if ( nRequest == 0 ) {
   runDur = parseInt(uiContent.runDur);
   console.log('[LPARid:id=%d:%d] nOrderers: %d, nPeers: %d, transMode: %s, transType: %s, invokeType: %s, runDur: %d', LPARid, pid, nOrderers, nPeers, transMode, transType, invokeType, runDur);
   // convert runDur to ms
   runDur = 1000*runDur;
}

//var g = ['grpc://10.120.223.35:7051', 'grpc://10.120.223.35:7052', 'grpc://10.120.223.35:7053'];
var g = [];
for (i=0; i<peers.length; i++) {
    tmp = 'grpc://' + peers[i].discovery_host + ":" + peers[i].discovery_port;
    g.push(tmp);
}

var grpcArgs = [];
grpcArgs.push(hfc.getPeer(g[pid % nPeers]));
console.log('[LPARid:id=%d:%d] grpc url: %s', LPARid, pid, g[pid % nPeers]);


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

//var testInvokeArgs = uiContent.invoke.move.args.split(",");
var testInvokeArgs = [];
for (i=0; i<uiContent.invoke.move.args.length; i++) {
    testInvokeArgs.push(uiContent.invoke.move.args[i]);
}

var request_invoke = {
    targets: grpcArgs,
    chaincodeId : chaincode_id,
    fcn: uiContent.invoke.move.fcn,
    args: testInvokeArgs
};

//var testQueryArgs
var testQueryArgs = [];
for (i=0; i<uiContent.invoke.query.args.length; i++) {
    testQueryArgs.push(uiContent.invoke.query.args[i]);
}

var request_query = {
    targets: grpcArgs,
    chaincodeId : chaincode_id,
    fcn: uiContent.invoke.query.fcn,
    args: testQueryArgs
};


/*
 *   transactions begin ....
 */
    execTransMode();

function execTransMode() {

    // init vars
    inv_m = 0;
    inv_q = 0;

    //enroll user
    chain.enroll(users[0].username, users[0].secret)
    .then(
        function(admin) {
            console.log('[LPARid:id=%d:%d] Successfully enrolled user \'admin\'', LPARid, pid);
            webUser = admin;

	    tCurr = new Date().getTime();
	    console.log('LPAR:id=%d:%d, execTransMode: tCurr= %d, tStart= %d, time to wait=%d', LPARid, pid, tCurr, tStart, tStart-tCurr);
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
                    console.log(util.format("LPAR:id=%d:%d, Transaction %j and/or mode %s invalid", LPARid, pid, transType, transMode));
                    process.exit(1);
                }
            }, tStart-tCurr);
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to wait due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        }
    );

}

function isExecDone(trType){
    tCurr = new Date().getTime();
    if ( trType.toUpperCase() == 'MOVE' ) {
        if ( nRequest > 0 ) {
           if ( (inv_m % (nRequest/10)) == 0 ) {
              console.log(util.format("LPAR:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
                                         LPARid, pid, trType, inv_m, tCurr-tLocal));
           }

           if ( inv_m >= nRequest ) {
                IDone = 1;
           }
        } else {
           if ( (inv_m % 1000) == 0 ) {
              console.log(util.format("LPAR:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
                                         LPARid, pid, trType, inv_m, tCurr-tLocal));
           }

           if ( tCurr > tEnd ) {
                IDone = 1;
           }
        }
    } else if ( trType.toUpperCase() == 'QUERY' ) {
        if ( nRequest > 0 ) {
           if ( (inv_q % (nRequest/10)) == 0 ) {
              console.log(util.format("LPAR:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
                                         LPARid, pid, trType, inv_q, tCurr-tLocal));
           }

           if ( inv_q >= nRequest ) {
                QDone = 1;
           }
        } else {
           if ( (inv_q % 1000) == 0 ) {
              console.log(util.format("LPAR:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
                                         LPARid, pid, trType, inv_q, tCurr-tLocal));
           }

           if ( tCurr > tEnd ) {
                QDone = 1;
           }
        }
    }


}



// invoke_move_simple
function invoke_move_simple(freq) {
    inv_m++;

    webUser.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            var proposal = results[1];
            if (proposalResponses[0].response.status === 200) {
                return webUser.sendTransaction(proposalResponses, proposal);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[LPARid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', LPARid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.Status === 'SUCCESS') {
                isExecDone('Move');
                if ( IDone != 1 ) {
                    setTimeout(function(){
                        invoke_move_simple(freq);
                    },freq);
                } else {
                    tCurr = new Date().getTime();
                    console.log('[LPARid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', LPARid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
            } else {
                console.log('[LPARid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', LPARid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}




// invoke_query_simple
function invoke_query_simple(freq) {
    inv_q++;

    webUser.queryByChaincode(request_query)
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
                    console.log('[LPARid:id=%d:%d] query result:', LPARid, pid, response_payloads[j].toString('utf8'));
                }
                console.log('[LPARid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', LPARid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                //return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send query due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
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
        console.log('[LPARid:id=%d:%d] tStart %d, tLocal %d', LPARid, pid, tStart, tLocal);
        if ( invokeType.toUpperCase() == 'MOVE' ) {
            var freq = 20000;
            invoke_move_simple(freq);
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_simple(0);
        }
    } else {
        console.log('[LPARid:id=%d:%d] invalid transType= %s', LPARid, pid, transType);
    }
}

// invoke_move_const
function invoke_move_const(freq) {
    inv_m++;

    webUser.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            var proposal = results[1];
            if (proposalResponses[0].response.status === 200) {
                return webUser.sendTransaction(proposalResponses, proposal);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[LPARid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', LPARid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.Status === 'SUCCESS') {
                // hist output
                if ( recHist == 'HIST' ) {
                    tCurr = new Date().getTime();
                    buff = LPARid +':'+ pid + ' ' + transType[0] + ':' + inv_m + ' time:'+ tCurr + '\n';
                    fs.appendFile(ofile, buff, function(err) {
                        if (err) {
                           return console.log(err);
                        }
                    })
                }

                isExecDone('Move');
                if ( IDone != 1 ) {
                    setTimeout(function(){
                        invoke_move_const(freq);
                    },freq);
                } else {
                    tCurr = new Date().getTime();
                    console.log('[LPARid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', LPARid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
            } else {
                console.log('[LPARid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', LPARid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}

// invoke_query_const
function invoke_query_const(freq) {
    inv_q++;

    webUser.queryByChaincode(request_query)
    .then(
        function(response_payloads) {
            // output
            if ( recHist == 'HIST' ) {
                tCurr = new Date().getTime();
                buff = LPARid +':'+ pid + ' ' + transType[0] + ':' + inv_q + ' time:'+ tCurr + '\n';
                fs.appendFile(ofile, buff, function(err) {
                    if (err) {
                       return console.log(err);
                    }
                })
            }
            isExecDone('Query');
            if ( QDone != 1 ) {
                setTimeout(function(){
                    invoke_query_const(freq);
                },freq);
            } else {
                tCurr = new Date().getTime();
                for(let j = 0; j < response_payloads.length; j++) {
                    console.log('[LPARid:id=%d:%d] query result:', LPARid, pid, response_payloads[j].toString('utf8'));
                }
                console.log('[LPARid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', LPARid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                //return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send query due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
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
        if ( runDur > 0 ) {
            tEnd = tLocal + runDur;
        }
        console.log('[LPARid:id=%d:%d] tStart %d, tLocal %d', LPARid, pid, tStart, tLocal);
        var freq = parseInt(uiContent.constantOpt.constFreq);
        ofile = 'ConstantResults'+LPARid+'.txt';
        //var ConstantFile = fs.createWriteStream('ConstantResults.txt');
        console.log('LPAR:id=%d:%d, Constant Freq: %d ms', LPARid, pid, freq);

        if ( invokeType.toUpperCase() == 'MOVE' ) {
            if ( freq < 20000 ) {
                freq = 20000;
            }
            invoke_move_const(freq);
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_const(freq);
        }
    } else {
        console.log('[LPARid:id=%d:%d] invalid transType= %s', LPARid, pid, transType);
    }
}

// mix mode
function invoke_move_mix(freq) {
    inv_m++;

    tCurr = new Date().getTime();
    console.log('LPAR:id=%d:%d, invoke_move_mix(): tCurr= %d, freq: %d', LPARid, pid, tCurr, freq);

    webUser.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            var proposal = results[1];
            if (proposalResponses[0].response.status === 200) {
                return webUser.sendTransaction(proposalResponses, proposal);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[LPARid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', LPARid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.Status === 'SUCCESS') {
                setTimeout(function(){
                    invoke_query_mix(freq);
                },freq);
            } else {
                console.log('[LPARid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', LPARid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}
// invoke_query_mix
function invoke_query_mix(freq) {
    inv_q++;

    tCurr = new Date().getTime();
    console.log('LPAR:id=%d:%d, invoke_query_mix(): tCurr= %d', LPARid, pid, tCurr);

    webUser.queryByChaincode(request_query)
    .then(
        function(response_payloads) {
                isExecDone('Move');
                if ( IDone != 1 ) {
                    invoke_move_mix(freq);
                } else {
                    for(let j = 0; j < response_payloads.length; j++) {
                        console.log('[LPARid:id=%d:%d] query result:', LPARid, pid, response_payloads[j].toString('utf8'));
                    }
                    tCurr = new Date().getTime();
                    console.log('[LPARid:id=%d:%d] completed %d Invoke(move) and %d invoke(query) in %d ms, timestamp: start %d end %d', LPARid, pid, inv_m, inv_q, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send query due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
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
        console.log('[LPARid:id=%d:%d] tStart %d, tLocal %d', LPARid, pid, tStart, tLocal);
        var freq = parseInt(uiContent.mixOpt.mixFreq);
        if ( freq < 20000 ) {
            freq = 20000;
        }
        console.log('LPAR:id=%d:%d, Mix Freq: %d ms', LPARid, pid, freq);
        invoke_move_mix(freq);
    } else {
        console.log('[LPARid:id=%d:%d] invalid transType= %s', LPARid, pid, transType);
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
    console.log('LPAR:id=%d:%d, getBurstFreq(): tCurr= %d', LPARid, pid, tCurr);

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

    webUser.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];
            var proposal = results[1];
            if (proposalResponses[0].response.status === 200) {
                return webUser.sendTransaction(proposalResponses, proposal);
                //console.log('Successfully obtained transaction endorsement.' + JSON.stringify(proposalResponses));
            } else {
                console.log('[LPARid:id=%d:%d] Failed to obtain transaction endorsement. Error code: ', LPARid, pid, status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .then(
        function(response) {
            if (response.Status === 'SUCCESS') {
                isExecDone('Move');
                if ( IDone != 1 ) {
                    setTimeout(function(){
                        invoke_move_burst();
                    },bFreq);
                } else {
                    tCurr = new Date().getTime();
                    console.log('[LPARid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', LPARid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    return;
                }
            } else {
                console.log('[LPARid:id=%d:%d] Failed to order the endorsement of the transaction. Error code: ', LPARid, pid, response.status);
                return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send transaction proposal due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
        }

    );
}

// invoke_query_burst
function invoke_query_burst() {
    inv_q++;

    // set up burst traffic duration and frequency
    getBurstFreq();

    webUser.queryByChaincode(request_query)
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
                    console.log('[LPARid:id=%d:%d] query result:', LPARid, pid, response_payloads[j].toString('utf8'));
                }
                console.log('[LPARid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', LPARid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                //return;
            }
        },
        function(err) {
            console.log('[LPARid:id=%d:%d] Failed to send query due to error: ', LPARid, pid, err.stack ? err.stack : err);
            return;
        })
    .catch(
        function(err) {
            console.log('[LPARid:id=%d:%d] %s failed: ', LPARid, pid, transType,  err.stack ? err.stack : err);
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

    console.log('LPAR:id=%d:%d, Burst setting: tDur =',LPARid, pid, tDur);
    console.log('LPAR:id=%d:%d, Burst setting: tFreq=',LPARid, pid, tFreq);

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
        console.log('[LPARid:id=%d:%d] tStart %d, tLocal %d', LPARid, pid, tStart, tLocal);
        console.log('LPAR:id=%d:%d, Mix Freq: %d ms', LPARid, pid, bFreq);
        if ( invokeType.toUpperCase() == 'MOVE' ) {
            invoke_move_burst();
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_burst();
        }
    } else {
        console.log('[LPARid:id=%d:%d] invalid transType= %s', LPARid, pid, transType);
    }
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

