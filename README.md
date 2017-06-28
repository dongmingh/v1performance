
#Performance Traffic Engine - PTE

----------

The Performance Traffic Engine (PTE) uses [Hyperledger Fabric Client (HFC) SDK](http://hyperledger-fabric.readthedocs.io/en/latest/Setup/NodeSDK-setup/) to interact with a [Hyperledger Fabric](https://github.com/hyperledger/fabric) network.

##Code Base for v1.0.0-RC1

- Fabric commit level: b17afeb9da2ae34ce9dd76de558fbd23623fb186
- fabric-sdk-node commit level: 244e916517f1c42d04b61eb55ea239cd94052846
- fabric-ca commit level: fec4d76fa2c8162b735be2376ec831ff815209c6
- PTE v1performance commit level: current

Note with PTE on RC1:

- Change cacerts to tlscacerts for both orderer and peer in config json in SCFiles directory. Below is an example of changes for orderer.

was:
  `"tls_cacerts": "/root/gopath/src/github.com/hyperledger/fabric/common/tools/cryptogen/crypto-config/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/cacerts/ca.example.com-cert.pem"`

now:
  `"tls_cacerts": "/root/gopath/src/github.com/hyperledger/fabric/common/tools/cryptogen/crypto-config/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"`

 
##Code Base for v1.0.0-alpha2

- Fabric commit level: 6b6bfcfbd1e798a8a08fa9c3bf4dc0ff766a6b87
- fabric-sdk-node commit level: f13f4b42e7155ec0dc3d7485b202bb6a6ca73aed
- fabric-ca commit level: f5216c35e8ce46e8c04842ec529d2c1974b95894
- PTE v1performance commit level: current

##Code Base for v1.0.0-alpha
For v1.0.0-alpha support, use v1performance commit level  aa73747ccf5f511fbcd10a962dd1e588bde1a8b0.  Below is the v1.0.0-alpha commit levels.

- Fabric commit level: fa3d88cde177750804c7175ae000e0923199735c
- fabric-sdk-node commit level: 196d0484c884ab894374c73df89bfe047bcc9f00
- fabric-ca commit level: 29385879bc2931cce9ec833acf796129908b72fb
- PTE v1performance commit level: aa73747ccf5f511fbcd10a962dd1e588bde1a8b0`


##Future items:

- PTE needs to supports any number of organizations in a channel.  PTE supports two organizations per channel now (FAB-3809)
- PTE can only send transactions to the anchor peer of an organization.  It will need to be able to send transactions to any peer.
- Endorsement policy is not supported yet.
- replace 'git clone https://github.com/hyperledger/fabric-sdk-node.git' with fabric-client and fabric-ca-client


##Pre-requisites

To build and test, the following pre-requisites must be installed first, see [Hyperledger fabric-sdk-node](https://github.com/hyperledger/fabric-sdk-node) and [Hyperledger Fabric](https://github.com/hyperledger/fabric) for detail:

- node runtime version 6.9.x, note that 7.0 is not supported at this point
- npm tool version 3.10.x
- gulp command
- docker


##Setup

1. cd $GOPATH/src/github.com/hyperledger
- git clone https://github.com/hyperledger/fabric
- cd fabric
- git reset --hard 6b6bfcfbd1e798a8a08fa9c3bf4dc0ff766a6b87
- make docker
- cd ..
- git clone https://github.com/hyperledger/fabric-ca
- cd fabric-ca
- git reset --hard f5216c35e8ce46e8c04842ec529d2c1974b95894
- make docker
- cd ..
- git clone https://github.com/hyperledger/fabric-sdk-node.git
- cd fabric-sdk-node
- git reset --hard f13f4b42e7155ec0dc3d7485b202bb6a6ca73aed
- rm -rf node_modules
- npm install
- gulp ca
- cd test
- git clone https://github.com/dongmingh/v1performance
- cd v1performance
- The current commit level runs with the latest commit levels (as listed above) for fabric, fabric-sdk-node, and fabric-ca. However, if testing v1.0.0-alpha, `git reset --hard aa73747ccf5f511fbcd10a962dd1e588bde1a8b0`
- cd SCFiles
- Create a Service Credentials file(s) for your Fabric network. Refer to existing config.json file examples. Change the address (10.120.223.35) to your own network nodes addresses. For example, if using NetworkLauncher to create docker containers on your laptop/workstation, use the same address when running NetworkLauncher tool with "-w" option, such as 127.0.0.1 or 0.0.0.0 or your machine eth0 ip address or your vagrant ip address (type ifconfig to find it). If you have an existing network, be sure to add a block for all your peers, each with the correct IP address and server-hostname
- cd ../userInputs
- Create your own version of runCases.txt and User Input json files, according to the test requirements. Use the desired chaincode name, channel name, organizations, etc. Using the information in your own network profiles, remember to "create" all channels, and "join" and "install" for each org, to ensure all peers are set up correctly. See sections below for more details on how to edit these files to use this tool.
- Before proceeding to run this performance tool pte_driver.sh, ensure your network is running! If you do not have an existing network already, consider using the [NetworkLauncher](https://github.com/dongmingh/v1Launcher) tool to spin up a network using docker containers:

        # OPTIONALLY download and follow its directions to start a network:
        cd $GOPATH/src/github.com/hyperledger/fabric-sdk-node/test
        git clone https://github.com/dongmingh/v1Launcher
        cd v1Launcher
        ./NetworkLauncher.sh -?


##Scripts

- pte_driver.sh: the performance traffic engine
- pte-main.js: the PTE main js
- pte-execRequest.js: A Node js executing transaction requests
- pte-util.js: the PTE utility js


##Usage

`./pte_driver.sh <run cases file>`

- run cases file: the file contains all user specified test cases


####Examples

- ./pte_driver.sh userInputs/runCases.txt

The above command will execute the transaction tests listed in the runCases.txt.


##runCases.txt file, in directory userInputs

This file contains all test cases to be executed.  Each line is a test case and includes two parameters: SDK type and user input file.  Below is an example of the runCases.txt containing two test cases using Node SDK:

    sdk=node userInputs/samplecc-chan1-i.json
    sdk=node userInputs/samplecc-chan2-i.json

Available SDK types are node, python and java. However, currently only node SDK is supported.


##User Input file format, in directory userInputs

    {
        "channelID": "_ch1",
        "chaincodeID": "sample_cc",
        "chaincodeVer": "v0",
        "chainID": "testchainid",
        "logLevel": "ERROR",
        "invokeCheck": "TRUE",
        "transMode": "Simple",
        "transType": "Invoke",
        "invokeType": "Move",
        "targetPeers": "Anchor",
        "nOrderer": "1",
        "nOrg": "2",
        "nPeerPerOrg": "2",
        "nProc": "4",
        "nRequest": "0",
        "runDur": "600",
        "TLS": "disabled",
        "channelOpt": {
            "name": "testOrg1",
            "channelTX": "/root/gopath/src/github.com/hyperledger/fabric/common/tools/cryptogen/crypto-config/ordererOrganizations/testOrgsChannel1.tx",
            "action":  "create",
            "orgName": [
                "testOrg1"
            ]
        },
        "burstOpt": {
            "burstFreq0":  "500",
            "burstDur0":  "3000",
            "burstFreq1": "2000",
            "burstDur1": "10000"
        },
        "mixOpt": {
            "mixQuery": "TRUE",
            "mixFreq": "2000"
        },
        "constantOpt": {
            "recHIST": "HIST",
            "constFreq": "1000",
            "devFreq": 300
        },
        "ccType": "general",
        "ccOpt": {
            "keyStart": "5000",
            "payLoadMin": "1024",
            "payLoadMax": "2048"
        },
        "deploy": {
            "chaincodePath": "github.com/ccchecker",
            "fcn": "init",
            "args": []
        },
        "invoke": {
            "query": {
                "fcn": "invoke",
                "args": ["get", "a"]
            },
            "move": {
                "fcn": "invoke",
                "args": ["put", "a", "string-msg"]
            }
        },   
	    "SCFile": [
            {"ServiceCredentials":"SCFiles/config-local.json"}
	    ]
    }
    
where:

+ **channelID**: channel ID for the run.

+ **chaincodeID**: chaincode ID for the run.

+ **chaincodeVer**: chaincode version.

+ **chainID**: chain ID for the run.  DO NOT CHANGE.

+ **legLevel**: logging level for the run.  Options are ERROR, DEBUG, or INFO.  Set to **ERROR** for performance test.  The default value is **ERROR**.

+ **invokeCheck**: if this is `TRUE`, then a query will be executed for the last invoke upon the receiving of the event of the last invoke.  This value is ignored for query test.
 
+ **transMode**: transaction mode
  -  Simple: one transaction type and rate only, the subsequent transaction is sent when the response of sending transaction (not the event handler), success or failure, of the previous transaction is received
  -  Burst: various traffic rates, see burstOpt for detailed
  -  Mix: mix invoke and query transactions, see mixOpt for detailed
  -  Constant: the transactions are sent by the specified rate, see constantOpt for detailed
  -  Latency: one transaction type and rate only, the subsequent transaction is sent when the event message (ledger update is completed) of the previous transaction is received

+ **transType**: transaction type
  - Channel: channel activities specified in channelOpt.action
  - Install: install chaincode
  - Instantiate: instantiate chaincode
  - Invoke: invokes transaction

+ **invokeType**: invoke transaction type.  This parameter is valid only if the transType is set to invoke
  - Move: move transaction
  - Query: query transaction

+ **targetPeers**: the target peers that transactions will sent to
  - Anchor: only send to anchor peers
  - All: send to all peers

+ **nOrderer**: number of orderers for traffic, this number shall not exceed the actual number of orderers in the network, or some transactions may fail.  One orderer is assigned to one thread with round robin. PTE currently only supports 1 orderer.

+ **nOrg**: number of organitzations for the test

+ **nPeerPerOrg**: number of peers per organization for the test

+ **nProc**: number of processes for the test

+ **nRequest**: number of transactions to be executed for each thread

+ **runDur**: run duration in seconds to be executed if nRequest is 0

+ **TLS**: TLS setting for the test: Disabled or Enabled, ONLY **Disabled** is supported now.

+ **channelOpt**: transType channel options
  - name: channel name
  - channelTX: channel transaction file
  - action: channel action: create or join
  - orgName: name of organization for the test

+ **burstOpt**: the frequencies and duration for Burst transaction mode traffic. Currently, two transaction rates are supported. The traffic will issue one transaction every burstFreq0 ms for burstDur0 ms, then one transaction every burstFreq1 ms for burstDur1 ms, then the pattern repeats. These parameters are valid only if the transMode is set to **Burst**.
  - burstFreq0: frequency in ms for the first transaction rate
  - burstDur0:  duration in ms for the first transaction rate
  - burstFreq1: frequency in ms for the second transaction rate
  - burstDur1:  duration in ms for the second transaction rate


+ **mixOpt**: each invoke is followed by a query on every thread. This parameter is valid only the transMode is set to **Mix**.

  - mixQuery: print out every query result if set to TRUE
  - mixFreq: frequency in ms for the transaction rate. This value should be set based on the characteristics of the chaincode to avoid the failure of the immediate query.

+ **constantOpt**: the transactions are sent at the specified rate. This parameter is valid only the transMode is set to **Constant**.
  
  - recHist: This parameter indicates if brief history of the run will be saved.  If this parameter is set to HIST, then the output is saved into a file, namely ConstantResults.txt, under the current working directory.  Otherwise, no history is saved.
  - constFreq: frequency in ms for the transaction rate.
  - devFreq: deviation of frequency in ms for the transaction rate. A random frequency is calculated between constFrq-devFreq and constFrq+devFreq for the next transaction.  The value is set to default value, 0, if this value is not set in the user input json file.  All transactions are sent at constant rate if this number is set to 0.

+ **ccType**: chaincode type

  - ccchecker: The first argument (key) in the query and invoke request is incremented by 1 for every transaction.  The prefix of the key is made of thread ID, ex, all keys issued from thread 4 will have prefix of **key3_**. And, the second argument (payload) in an invoke (Move) is a random string of size ranging between payLoadMin and payLoadMax defined in ccOpt.
 
  - auction: The first argument (key) in the query and invoke request is incremented by 1 for every transaction.  And, the invoke second argument (payload) is made of a random string with various size between payLoadMin and payLoadMax defined in ccOpt. (**to be tested**)

  - general: The arguments of transaction request are taken from the user input json file without any changes.

+ **ccOpt**: chaincode options
  - keyStart: the starting transaction key index, this is used when the ccType is non general which requires a unique key for each invoke.
  - payLoadMin: minimum size in bytes of the payload. The payload is made of random string with various size between payLoadMin and payLoadMax.
  - payLoadMax: maximum size in bytes of the payload

+ **deploy**: deploy transaction contents

+ **invoke** invoke transaction contents
  - query: query content
  - move: move content

+ **SCFile**: the service credentials json.


##Service Credentials, in directory SCFiles

The service credentials contain the information of the network.  The following is a sample of the service credentials json file:

    {
        "test-network": {
                "orderer": {
                        "orderer1": {
                                "name": "OrdererMSP",
                                "mspid": "OrdererMSP",
                                "mspPath": "./crypto-config",
                                "adminPath": "./crypto-config/ordererOrganizations/example.com/users/Admin@example.com/msp",
                                "comName": "example.com",
                                "url": "grpcs://localhost:7050",
                                "server-hostname": "orderer0.example.com",
                                "tls_cacerts": "./crypto-config/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/cacerts/ca.example.com-cert.pem"
                        },
                        "orderer2": {
                                "name": "OrdererMSP",
                                "mspid": "OrdererMSP",
                                "mspPath": "./crypto-config",
                                "adminPath": "./crypto-config/ordererOrganizations/example.com/users/Admin@example.com/msp",
                                "comName": "example.com",
                                "url": "grpcs://localhost:8050",
                                "server-hostname": "orderer1.example.com",
                                "tls_cacerts": "./crypto-config/ordererOrganizations/example.com/orderers/orderer1.example.com/msp/cacerts/ca.example.com-cert.pem"
                        }
                },
                "org1": {
                        "name": "Org1MSP",
                        "mspid": "Org1MSP",
                        "mspPath": "./crypto-config",
                        "adminPath": "./crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
                        "comName": "example.com",
                        "ordererID": "orderer1",
                        "ca": {
                             "url":"https://localhost:7054",
                             "name": "ca-org1"
                        },
                        "username": "admin",
                        "secret": "adminpw",
                        "peer1": {
                                "requests": "grpcs://localhost:7051",
                                "events": "grpcs://localhost:7053",
                                "server-hostname": "peer0.org1.example.com",
                                "tls_cacerts": "./crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp/cacerts/ca.org1.example.com-cert.pem"
                        }
                },
                "org2": {
                        "name": "Org2MSP",
                        "mspid": "Org2MSP",
                        "mspPath": "./crypto-config",
                        "adminPath": "./crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp",
                        "comName": "example.com",
                        "ordererID": "orderer2",
                        "ca": {
                             "url":"https://localhost:8054",
                             "name": "ca-org2"
                        },
                        "username": "admin",
                        "secret": "adminpw",
                        "peer1": {
                                "requests": "grpcs://localhost:9051",
                                "events": "grpcs://localhost:9053",
                                "server-hostname": "peer0.org2.example.com",
                                "tls_cacerts": "./crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/msp/cacerts/ca.org2.example.com-cert.pem"
                        },
                        "peer2": {
                                "requests": "grpcs://localhost:10051",
                                "events": "grpcs://localhost:10053",
                                "server-hostname": "peer1.org2.example.com",
                                "tls_cacerts": "./crypto-config/peerOrganizations/org2.example.com/peers/peer1.org2.example.com/msp/cacerts/ca.org2.example.com-cert.pem"
                        }
                }
        }
    }


##Chaincodes

The following chaincodes are tested and supported:

* **example02 chaincode**: This is a simple chaincode with limited capability.  This chaincode is **NOT** suitable for performance benchmark.

* **ccchecker chaincode**:  This chaincode supports variable payload sizes. See userInput-ccchecker.json for example of userInput file. Take the following steps to install this chaincode:
  - cd $GOPATH/src/github.com/hyperledger/fabric-sdk-node/test/fixtures/src/github.com
  - mkdir ccchecker
  - download newkeyperinvoke.go into ccchecker directory


* **sample chaincode**: This chaincode supports variable (randomized) payload sizes and performs encryption and decryption on the payload. Specify ccType as ccchecker when using this chaincode.  See userInput-samplecc.json for example of userInput file. Take the following steps to install this chaincode:
  - cd $GOPATH/src/github.com/hyperledger/fabric-sdk-node/test/fixtures/src/github.com
  - mkdir sample_cc
  - download chaincode_sample.go into sample_cc directory


##Transaction Execution

File runCases.txt may contain more than one testcase, executed sequentially.
A testcase is a userInput file, which defines all the test parameters, including transaction type, number of threads, number of transactions, duration, etc. 
All threads in one testcase will concurrently execute the specified transaction.
Different transactions may be used in different testCases included within a single runCases.txt file, making it possible for example to send a certain number of invokes to all peers and then query each peer.

Two types of transaction requests:

+ By transaction number: Each thread executes the specified number of transactions specified by nRequest in the user input file.
    
+ By run time duration: Each thread executes the same transaction concurrently for the specified time duration specified by runDur in the user input file, note that nRequest is set to 0.


##Use Cases
PTE can be used for channel (create, join), chaincode (install and instantiate) and transactions (invoke (move) and invoke (query)).  Specify settings in the run cases file, user input files, and configuration file (config.json).

###Channel

For any channel activities (create or join), set transType to Channel:

    "transMode": "Simple",
    "transType": "Channel",
    "invokeType": "Move",

####Create a channel

To create a channel, set the action in channelOpt to create, and set the name to the channel name:

    "channelOpt": {
        "name": "testChannel1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },

Note that orgName is ignored in this test.

####Join a channel

To join all peers in an org to a channel, set the action in channelOpt to join, set name to channel name, and set orgName to org name:

    "channelOpt": {
        "name": "testChannel1",
        "action":  "join",
        "orgName": [
            "testOrg1"
        ]
    },

###Deployment (install and instantiate)

To install or instantiate a chaincode, set up the deploy clause according to the test, such as:

    "deploy": {
        "chaincodePath": "github.com/sample_cc",
        "fcn": "init",
        "args": []
    },


####Install a chaincode

To install a chaincode, set the transType as install:

    "transMode": "Simple",
    "transType": "install",
    "invokeType": "Move",

and set channelOpt name to channel name and orgName to org name:

    "channelOpt": {
        "name":  "testChannel1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },

Note that the action is ignored.

####Instantiate a chaincode

To instantiate a chaincode, set the transType as instantiate:

    "transMode": "Simple",
    "transType": "instantiate",
    "invokeType": "Move", 

and set channelOpt name to channel name:

    "channelOpt": {
        "name":  "testChannel1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },

Note that the action and orgName are ignored.

###Transactions

####Invoke (move)

To execute invoke (move) transactions, set the transType to Invoke and invokeType to Move, and specify the network parameters and desired execution parameters:

    "invokeCheck": "TRUE",
    "transMode": "Constant",
    "transType": "Invoke",
    "invokeType": "Move",
    "targetPeers": "Anchor",
    "nOrderer": "1",
    "nOrg": "2",
    "nPeerPerOrg": "2",
    "nThread": "4",
    "nRequest": "1000",
    "runDur": "600",
    "TLS": "Disabled",

and the channel name in channelOpt:

    "channelOpt": {
        "name": "testChannel1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },


####Invoke (query)

To execute invoke (move) transactions, set the transType to Invoke and invokeType to Query, and specify the network parameters and desired execution parameters:

    "invokeCheck": "TRUE",
    "transMode": "Constant",
    "transType": "Invoke",
    "invokeType": "Query",
    "targetPeers": "Anchor",
    "nOrderer": "1",
    "nOrg": "2",
    "nPeerPerOrg": "2",
    "nThread": "4",
    "nRequest": "1000",
    "runDur": "600",
    "TLS": "Disabled",

and the channel name in channelOpt:

    "channelOpt": {
        "name": "testChannel1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },


##Some test scenarios

+ For different chaincode deployment or transactions, each user input file is set to a chaincode for deployment and set different transaction request for transactions.

+ For density test, set each SCFile to a unique network, then the test is executed on multiple networks with unique workload specified in the user input file concurrently.

+ For stress test on a network,  set all SCFiles to same network, then the test is executed on one network but with the workload specified in each user input file concurrently.


##Output

The output includes network id, thread id, transaction type, total transactions, completed transactions, failed transactions, starting time, ending time, and elapsed time.

The following is an example of invoke moves test output. The test contains 4 threads on one network.  The output shows that network 0 thread 0 executed 1000 moves with no failure in 406530 ms, network 0 thread 1 executed 1000 moves with no failure in 400421 ms etc.  Also, the starting and ending timestamps are provided.

    stdout: [Nid:id=0:3] eventRegister: completed 1000(1000) Invoke(Move) in 259473 ms, timestamp: start 1492024894518 end 1492025153991
    stdout: [Nid:id=0:2] eventRegister: completed 1000(1000) Invoke(Move) in 364174 ms, timestamp: start 1492024894499 end 1492025258673
    stdout: [Nid:id=0:1] eventRegister: completed 1000(1000) Invoke(Move) in 400421 ms, timestamp: start 1492024894500 end 1492025294921
    stdout: [Nid:id=0:0] eventRegister: completed 1000(1000) Invoke(Move) in 406530 ms, timestamp: start 1492024894498 end 1492025301028


##Examples

The following test cases execute the same command

    pte_driver.sh userInputs/runCases.txt

with a specific runCases.txt.

####Latency

That the runCases.txt contains:

    sdk=node samplecc-latency-i.json

will execute 1000 invokes (Move) with 1 thread on one network using sample_cc chaincode.  The average of the execution result (execution time (ms)/1000 transactions) represents the latency of 1 invoke (Move).


####Long run

That the runCases.txt contains:

    sdk=node userInputs/samplecc-longrun-i.json

will execute invokes (Move) of various payload size ranging from 1kb-2kb with 1 threads on one network using sample_cc chaincode for 72 hours at 1 transaction per second.


####Concurrency

That the runCases.txt contains:

    sdk=node samplecc-concurrency-i.json

will execute invokes (Move) of 1kb payload with 50 threads on one 4-peer network using sample_cc chaincode for 10 minutes.


####Complex

That the runCases.txt contains:

    sdk=node samplecc-complex-i.json

will execute invokes (Move) of various payload size ranging from 10kb-500kb with 10 threads on one 4-peer network using sample_cc chaincode for 10 minutes. Each invoke (Move) is followed by an invoke (Query).

