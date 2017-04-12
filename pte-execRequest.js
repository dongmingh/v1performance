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
 *      node pte-execRequest.js pid Nid uiFile tStart
 *        - action: deploy, invoke, query
 *        - recurrence: integer number
 */
// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('E2E');
logger.setLevel('ERROR');

var path = require('path');

var hfc = require('fabric-client');
hfc.setLogger(logger);

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

const crypto = require('crypto');

utils.setConfigSetting('crypto-keysize', 256);


// local vars
var the_user;
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
var invokeCheck;
var chaincode_id;
var chaincode_ver;
var chain_id;
var tx_id = null;
var nonce = null;
var the_user = null;
var eventHubs=[];
var targets = [];
var eventPromises = [];

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
var TLS=uiContent.TLS;
var channelOpt=uiContent.channelOpt;
var channelOrgName = [];
var channelName = channelOpt.name;
for (i=0; i<channelOpt.orgName.length; i++) {
    channelOrgName.push(channelOpt.orgName[i]);
}
console.log('TLS: %s', TLS.toUpperCase());
console.log('channelOrgName.length: %d, channelOrgName: %s', channelOrgName.length, channelOrgName);

var client = new hfc();
var chain = client.newChain(channelName);

invokeCheck = uiContent.invokeCheck;
console.log('[Nid:id=%d:%d] invokeCheck: ', Nid, pid, invokeCheck);

var channelID = uiContent.channelID;
chaincode_id = uiContent.chaincodeID+channelID;
chaincode_ver = uiContent.chaincodeVer;
chain_id = uiContent.chainID+channelID;
console.log('[Nid:id=%d:%d] chaincode_id: %s, chain_id: %s', Nid, pid, chaincode_id, chain_id);

//set log level
var logLevel;
    if (typeof( uiContent.logLevel ) == 'undefined') {
        logLevel='ERROR';
    } else {
        logLevel=uiContent.logLevel;
    }
console.log('[Nid:id=%d:%d] logLevel: %s', Nid, pid, logLevel);
logger.setLevel(logLevel);

var svcFile = uiContent.SCFile[0].ServiceCredentials;
var org=channelOrgName[0];
console.log('svcFile: %s, org: %s', svcFile, org);
hfc.addConfigFile(path.join(__dirname, svcFile));
var ORGS = hfc.getConfigSetting('test-network');
var orgName = ORGS[org].orgName;

var users =  hfc.getConfigSetting('users');

//user parameters
var transMode = uiContent.transMode;
var transType = uiContent.transType;
var invokeType = uiContent.invokeType;
var nRequest = parseInt(uiContent.nRequest);
var nThread = parseInt(uiContent.nThread);
var nOrg = parseInt(uiContent.nOrg);
var nPeerPerOrg = parseInt(uiContent.nPeerPerOrg);
var nPeer = nOrg * nPeerPerOrg;

var nOrderer = parseInt(uiContent.nOrderer);
console.log('[Nid:id=%d:%d] nOrderer: %d, nPeer: %d, transMode: %s, transType: %s, invokeType: %s, nRequest: %d', Nid, pid, nOrderer, nPeer, transMode, transType, invokeType, nRequest);

var runDur=0;
if ( nRequest == 0 ) {
   runDur = parseInt(uiContent.runDur);
   console.log('[Nid:id=%d:%d] nOrderer: %d, nPeer: %d, transMode: %s, transType: %s, invokeType: %s, runDur: %d', Nid, pid, nOrderer, nPeer, transMode, transType, invokeType, runDur);
   // convert runDur from second to ms
   runDur = 1000*runDur;
}


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
        testInvokeArgs[1] = 'key_'+channelID+'_'+pid+'_'+arg0;
        // random payload
        var r = Math.floor(Math.random() * (payLoadMax - payLoadMin)) + payLoadMin;

        var buf = crypto.randomBytes(r);
        testInvokeArgs[2] = buf.toString('hex');
    }

    nonce = utils.getNonce();
    tx_id = hfc.buildTransactionID(nonce, the_user);
    utils.setConfigSetting('E2E_TX_ID', tx_id);
    logger.info('setConfigSetting("E2E_TX_ID") = %s', tx_id);

    request_invoke = {
        chaincodeId : chaincode_id,
        chaincodeVersion : chaincode_ver,
        chainId: channelName,
        fcn: uiContent.invoke.move.fcn,
        args: testInvokeArgs,
        txId: tx_id,
        nonce: nonce
    };


    if ( inv_m == nRequest ) {
        if (invokeCheck.toUpperCase() == 'TRUE') {
            console.log('request_invoke: ', request_invoke);
        }
    }

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
        testQueryArgs[1] = 'key_'+channelID+'_'+pid+'_'+arg0;
    }

    nonce = utils.getNonce();
    tx_id = hfc.buildTransactionID(nonce, the_user);
    request_query = {
        chaincodeId : chaincode_id,
        chaincodeVersion : chaincode_ver,
        chainId: channelName,
        txId: tx_id,
        nonce: nonce,
        fcn: uiContent.invoke.query.fcn,
        args: testQueryArgs
    };

    //console.log('request_query: ', request_query);
}


function assignThreadPeer(chain, client) {
    console.log('[assignThreadPeer Nid:pid=%d:%d] chain name: %s', Nid, pid, chain.getName());
    var peerIdx=0;
    var peerTmp;
    var eh;
    for (let key1 in ORGS) {
        if (ORGS.hasOwnProperty(key1)) {
            for (let key in ORGS[key1]) {
            if (key.indexOf('peer') === 0) {
                if (peerIdx == pid % nPeer) {
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
                    console.log('[assignThreadPeer] requests: %s, events: %s ', ORGS[key1][key].requests, ORGS[key1][key].events);
                }
                peerIdx++;
                }
            }
        }
    }
    console.log('[assignThreadPeer Nid:pid=%d:%d] add peer: ', Nid, pid, chain.getPeers());
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
    console.log('[channelAddPeer] add peer: ', chain.getPeers());
}


function channelAddPeerEvent(chain, client, org) {
    console.log('[channelAddPeerEvent] chain name: ', chain.getName());
            var eh;
            var peerTmp;
            for (let key in ORGS[org]) {
                console.log('key: ', key);
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
                //console.log('[channelAddPeerEvent] add peer: ', chain.getPeers());
                //console.log('[channelAddPeerEvent] event: ', eventHubs);
            }
}

function channelAddOrderer(chain, client, org) {
    console.log('[channelAddOrderer] chain name: ', chain.getName());
    if (TLS.toUpperCase() == 'ENABLED') {
        var caRootsPath = ORGS.orderer.tls_cacerts;
        let data = fs.readFileSync(path.join(__dirname, caRootsPath));
        let caroots = Buffer.from(data).toString();

        chain.addOrderer(
            new Orderer(
                ORGS.orderer.url,
                {
                    'pem': caroots,
                    'ssl-target-name-override': ORGS.orderer['server-hostname']
                }
            )
        );
    } else {
        chain.addOrderer( new Orderer(ORGS.orderer.url));
        console.log('[channelAddOrderer] orderer url: ', ORGS.orderer.url);
    }
    //console.log('[channelAddOrderer] orderer in the chain: ', chain.getOrderers());
}

function channelAddAnchorPeer(chain, client, org) {
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
                    //console.log('[channelAddAnchorPeer] key: %s, peer1: %s', key, ORGS[org].peer1.requests);
                    peerTmp = new Peer( ORGS[key].peer1.requests);
                    targets.push(peerTmp);
                    chain.addPeer(peerTmp);
                }

                if ( invokeType.toUpperCase() == 'MOVE' ) {
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
    console.log('[channelAddAnchorPeer] get peer: ', chain.getPeers());
    console.log('[channelAddAnchorPeer] event: ', eventHubs);
}

/*
 *   transactions begin ....
 */
    execTransMode();

function execTransMode() {

    // init vars
    inv_m = 0;
    inv_q = 0;

    var caRootsPath = ORGS.orderer.tls_cacerts;
    let data = fs.readFileSync(path.join(__dirname, caRootsPath));
    let caroots = Buffer.from(data).toString();


    //enroll user
    hfc.newDefaultKeyValueStore({
        path: testUtil.storePathForOrg(orgName)
    }).then(
        function (store) {
            client.setStateStore(store);
            console.log('[Nid:id=%d:%d] Successfully setStateStore', Nid, pid);

            testUtil.getSubmitter(users.username, users.secret, client, false, org)
            .then(
                function(admin) {

                    console.log('[Nid:id=%d:%d] Successfully loaded user \'admin\'', Nid, pid);
                    the_user = admin;

                    channelAddOrderer(chain, client, org)

                    //channelAddAnchorPeer(chain, client, org);
                    assignThreadPeer(chain, client);

	            tCurr = new Date().getTime();
                    var tSynchUp=tStart-tCurr;
                    if ( tSynchUp < 10000 ) {
                        tSynchUp=10000;
                    }
	            console.log('Nid:id=%d:%d, execTransMode: tCurr= %d, tStart= %d, time to wait=%d', Nid, pid, tCurr, tStart, tSynchUp);
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
                        } else if (transMode.toUpperCase() == 'LATENCY') {
                            execModeLatency();
                        } else {
                            // invalid transaction request
                            console.log(util.format("Nid:id=%d:%d, Transaction %j and/or mode %s invalid", Nid, pid, transType, transMode));
                            process.exit(1);
                        }
                    }, tSynchUp);
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
              console.log(util.format("Nid:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
                                         Nid, pid, trType, inv_m, tCurr-tLocal));
           }

           if ( inv_m >= nRequest ) {
                IDone = 1;
           }
        } else {
           if ( (inv_m % 1000) == 0 ) {
              console.log(util.format("Nid:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
                                         Nid, pid, trType, inv_m, tCurr-tLocal));
           }

           if ( tCurr > tEnd ) {
                IDone = 1;
           }
        }
    } else if ( trType.toUpperCase() == 'QUERY' ) {
        if ( nRequest > 0 ) {
           if ( (inv_q % (nRequest/10)) == 0 ) {
              console.log(util.format("Nid:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
                                         Nid, pid, trType, inv_q, tCurr-tLocal));
           }

           if ( inv_q >= nRequest ) {
                QDone = 1;
           }
        } else {
           if ( (inv_q % 1000) == 0 ) {
              console.log(util.format("Nid:id=%d:%d, invokes(%s) sent: number=%d, elapsed time= %d",
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

var evtRcv=0;
function eventRegister(tx, cb) {
    var txId = tx.toString();

    var deployId = tx_id.toString();
    var eventPromises = [];
    eventHubs.forEach((eh) => {
        let txPromise = new Promise((resolve, reject) => {
            let handle = setTimeout(reject, 600000);

            eh.registerTxEvent(deployId.toString(), (tx, code) => {
                clearTimeout(handle);
                eh.unregisterTxEvent(deployId);
                evtRcv++;

                if (code !== 'VALID') {
                    console.log('[eventRegister [Nid:id=%d:%d]] The invoke transaction was invalid, code = ', Nid, pid, code);
                    reject();
                } else {
                    if ( ( IDone == 1 ) && ( inv_m == evtRcv ) ) {
                        tCurr = new Date().getTime();
                        console.log('[Nid:id=%d:%d] eventRegister: completed %d(%d) %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, evtRcv, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                        if (invokeCheck.toUpperCase() == 'TRUE') {
                            arg0 = keyStart + inv_m - 1;
                            inv_q = inv_m - 1;
                            invoke_query_simple(0);
                        }
                        evtDisconnect();
                        resolve();
                    }
                }
            });
        });

        eventPromises.push(txPromise);
    });
    //var sendPromise = chain.sendTransaction(txRequest);
    cb(eventPromises);
        //cb(txRequest);
    /*
    return Promise.all([sendPromise].concat(eventPromises))
    .then((results) => {
        console.log(' event promise all complete and testing complete');
        return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
    }).catch((err) => {
        console.log('Failed to send transaction and get notifications within the timeout period.');
        evtDisconnect();
        throw new Error('Failed to send transaction and get notifications within the timeout period.');
    });
    */
}

function eventRegister_latency(tx, cb) {
    var txId = tx.toString();

    var deployId = tx_id.toString();
    var eventPromises = [];
    eventHubs.forEach((eh) => {
        let txPromise = new Promise((resolve, reject) => {
            let handle = setTimeout(reject, 600000);
            evtRcv++;

            eh.registerTxEvent(deployId.toString(), (tx, code) => {
                clearTimeout(handle);
                eh.unregisterTxEvent(deployId);

                if (code !== 'VALID') {
                    console.log('[eventRegister_latency [Nid:id=%d:%d]] The invoke transaction was invalid, code = ', Nid, pid, code);
                    reject();
                } else {
                    if ( ( IDone == 1 ) && ( inv_m == evtRcv ) ) {
                        tCurr = new Date().getTime();
                        console.log('[Nid:id=%d:%d] eventRegister_latency: completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                        if (invokeCheck.toUpperCase() == 'TRUE') {
                            arg0 = keyStart + inv_m - 1;
                            inv_q = inv_m - 1;
                            invoke_query_simple(0);
                        }
                        evtDisconnect();
                        resolve();
                    } else if ( IDone != 1 ) {
                        invoke_move_latency();
                    }
                }
            });
        });

        eventPromises.push(txPromise);
    });
    //var sendPromise = chain.sendTransaction(txRequest);
    cb(eventPromises);
    
/*
    return Promise.all([sendPromise].concat(eventPromises))
    .then((results) => {
        console.log(' event promise all complete and testing complete');
        return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
    }).catch((err) => {
        console.log('Failed to send transaction and get notifications within the timeout period.');
        evtDisconnect();
        throw new Error('Failed to send transaction and get notifications within the timeout period.');
    });
*/
    
}


// invoke_move_latency
function invoke_move_latency() {
    if ( IDone == 1 ) {
       return;
    }

    inv_m++;

    getMoveRequest();

    chain.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];

            getTxRequest(results);
            eventRegister_latency(request_invoke.txId, function(sendPromise) {

                var sendPromise = chain.sendTransaction(txRequest);
                return Promise.all([sendPromise].concat(eventPromises))
                .then((results) => {

                    isExecDone('Move');
                    return results[0];

                }).catch((err) => {
                    console.log('[Nid:id=%d:%d] Failed to send transaction due to error: ', Nid, pid, err.stack ? err.stack : err);
                    evtDisconnect();
                    return;
                })
            },
            function(err) {
                console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
                evtDisconnect();
            })

        });

}


function execModeLatency() {

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
            invoke_move_latency();
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_simple(0);
        }
    } else {
        console.log('[Nid:id=%d:%d] invalid transType= %s', Nid, pid, transType);
        evtDisconnect();
    }
}

// invoke_move_simple
function invoke_move_simple(freq) {
    inv_m++;

    getMoveRequest();

    chain.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];

            getTxRequest(results);
            eventRegister(request_invoke.txId, function(sendPromise) {

                var sendPromise = chain.sendTransaction(txRequest);
                return Promise.all([sendPromise].concat(eventPromises))
                .then((results) => {
                    //tCurr = new Date().getTime();
                    //console.log('[Nid:id=%d:%d] event promise all complete and testing completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);

                    isExecDone('Move');
                    if ( IDone != 1 ) {
                        setTimeout(function(){
                            invoke_move_simple(freq);
                        },freq);
                    } else {
                        tCurr = new Date().getTime();
                        console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    //    return;
                    }
                    return results[0];

                }).catch((err) => {
                    console.log('[Nid:id=%d:%d] Failed to send transaction due to error: ', Nid, pid, err.stack ? err.stack : err);
                    evtDisconnect();
                    return;
                })
            },
            function(err) {
                console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
                evtDisconnect();
            })

        });
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
                if (response_payloads) {
                    console.log('response_payloads length:', response_payloads.length);
                    for(let j = 0; j < response_payloads.length; j++) {
                        //console.log('[Nid:id=%d:%d key:%d] invoke_query_simple query result:', Nid, pid, inv_q, response_payloads[j].toString('utf8'));
                        console.log('[Nid:id=%d:%d] query result:', Nid, pid, response_payloads[j].toString('utf8'));
                    }
                } else {
                    console.log('response_payloads is null');
                }
                console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                process.exit();
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send query due to error: ', Nid, pid, err.stack ? err.stack : err);
            process.exit();
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
            process.exit();
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
        evtDisconnect();
    }
}

var devFreq;
function getRandomNum(min0, max0) {
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

            getTxRequest(results);
            eventRegister(request_invoke.txId, function(sendPromise) {

                var sendPromise = chain.sendTransaction(txRequest);
                return Promise.all([sendPromise].concat(eventPromises))
                .then((results) => {
                    //tCurr = new Date().getTime();
                    //console.log('[Nid:id=%d:%d] event promise all complete and testing completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);

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
                        var freq_n=freq;
                        if ( devFreq > 0 ) {
                            freq_n=getRandomNum(freq-devFreq, freq+devFreq);
                        }
                        setTimeout(function(){
                            invoke_move_const(freq);
                        },freq);
                    } else {
                        tCurr = new Date().getTime();
                        console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                        return;
                    }
                    //return results[0];

                }).catch((err) => {
                    console.log('[Nid:id=%d:%d] Failed to send transaction due to error: ', Nid, pid, err.stack ? err.stack : err);
                    evtDisconnect();
                    return;
                })
            },
            function(err) {
                console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
                evtDisconnect();
            })

        });
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
                var freq_n=getRandomNum(freq-devFreq, freq+devFreq);
                setTimeout(function(){
                    invoke_query_const(freq);
                },freq_n);
            } else {
                tCurr = new Date().getTime();
                for(let j = 0; j < response_payloads.length; j++) {
                    console.log('[Nid:id=%d:%d] query result:', Nid, pid, response_payloads[j].toString('utf8'));
                }
                console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_q, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                process.exit();
            }
        },
        function(err) {
            console.log('[Nid:id=%d:%d] Failed to send query due to error: ', Nid, pid, err.stack ? err.stack : err);
            process.exit();
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
            process.exit();
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
        console.log('[Nid:id=%d:%d] tStart %d, tLocal %d', Nid, pid, tStart, tLocal);
        var freq = parseInt(uiContent.constantOpt.constFreq);
        ofile = 'ConstantResults'+Nid+'.txt';

        if (typeof( uiContent.constantOpt.devFreq ) == 'undefined') {
            console.log('devFreq undefined, set to 0');
            devFreq=0;
        } else {
            devFreq = parseInt(uiContent.constantOpt.devFreq);
        }

        console.log('Nid:id=%d:%d, Constant Freq: %d ms, variance Freq: %d ms', Nid, pid, freq, devFreq);

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
        evtDisconnect();
    }
}

// mix mode
function invoke_move_mix(freq) {
    inv_m++;

    getMoveRequest();

    chain.sendTransactionProposal(request_invoke)
    .then(
        function(results) {
            var proposalResponses = results[0];

            getTxRequest(results);
            eventRegister(request_invoke.txId, function(sendPromise) {

                var sendPromise = chain.sendTransaction(txRequest);
                return Promise.all([sendPromise].concat(eventPromises))
                .then((results) => {
                    //tCurr = new Date().getTime();
                    //console.log('[Nid:id=%d:%d] event promise all complete and testing completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);

                    if ( IDone != 1 ) {
                        setTimeout(function(){
                            invoke_query_mix(freq);
                        },freq);
                    } else {
                        tCurr = new Date().getTime();
                        console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    //    return;
                    }
                    isExecDone('Move');
                    return results[0];

                }).catch((err) => {
                    console.log('[Nid:id=%d:%d] Failed to send transaction due to error: ', Nid, pid, err.stack ? err.stack : err);
                    evtDisconnect();
                    return;
                })
            },
            function(err) {
                console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
                evtDisconnect();
            })

        });
}

// invoke_query_mix
function invoke_query_mix(freq) {
    inv_q++;

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
            evtDisconnect();
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
            evtDisconnect();
        }
    );

}
function execModeMix() {

    // send proposal to endorser
    if ( transType.toUpperCase() == 'INVOKE' ) {
        // no need to check since a query is issued after every invoke
        invokeCheck = 'FALSE';
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
        console.log('Nid:id=%d:%d, Mix Freq: %d ms', Nid, pid, freq);
        invoke_move_mix(freq);
    } else {
        console.log('[Nid:id=%d:%d] invalid transType= %s', Nid, pid, transType);
        evtDisconnect();
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
    //console.log('Nid:id=%d:%d, getBurstFreq(): tCurr= %d', Nid, pid, tCurr);

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

            getTxRequest(results);
            eventRegister(request_invoke.txId, function(sendPromise) {

                var sendPromise = chain.sendTransaction(txRequest);
                return Promise.all([sendPromise].concat(eventPromises))
                .then((results) => {
                    //tCurr = new Date().getTime();
                    //console.log('[Nid:id=%d:%d] event promise all complete and testing completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);

                    isExecDone('Move');
                    if ( IDone != 1 ) {
                        setTimeout(function(){
                            invoke_move_burst();
                        },bFreq);
                    } else {
                        tCurr = new Date().getTime();
                        console.log('[Nid:id=%d:%d] completed %d %s(%s) in %d ms, timestamp: start %d end %d', Nid, pid, inv_m, transType, invokeType, tCurr-tLocal, tLocal, tCurr);
                    //    return;
                    }
                    return results[0];

                }).catch((err) => {
                    console.log('[Nid:id=%d:%d] Failed to send transaction due to error: ', Nid, pid, err.stack ? err.stack : err);
                    evtDisconnect();
                    return;
                })
            },
            function(err) {
                console.log('[Nid:id=%d:%d] Failed to send transaction proposal due to error: ', Nid, pid, err.stack ? err.stack : err);
                evtDisconnect();
            })

        });
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
            evtDisconnect();
            return;
        })
    .catch(
        function(err) {
            console.log('[Nid:id=%d:%d] %s failed: ', Nid, pid, transType,  err.stack ? err.stack : err);
            evtDisconnect();
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
        console.log('Nid:id=%d:%d, Mix Freq: %d ms', Nid, pid, bFreq);
        if ( invokeType.toUpperCase() == 'MOVE' ) {
            invoke_move_burst();
        } else if ( invokeType.toUpperCase() == 'QUERY' ) {
            invoke_query_burst();
        }
    } else {
        console.log('[Nid:id=%d:%d] invalid transType= %s', Nid, pid, transType);
        evtDisconnect();
    }
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function evtDisconnect() {
    for ( i=0; i<eventHubs.length; i++) {
        if (eventHubs[i] && eventHubs[i].isconnected()) {
            logger.info('Disconnecting the event hub: %d', i);
            eventHubs[i].disconnect();
        }
    }
}

