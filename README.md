
#Performance Traffic Engine - PTE

----------

The Performance Traffic Engine (PTE) uses [Hyperledger Fabric Client (HFC) SDK](http://hyperledger-fabric.readthedocs.io/en/latest/Setup/NodeSDK-setup/) to interact with a [Hyperledger fabric](https://github.com/hyperledger/fabric) network.

##Code Base

- fabric commit level: aa119ec8d446a34df70a281efad649626b41d395
- fabric-sdk-node commit level: 214a499b51185ff32ba1e646e72e50f7b3b7afc4
- fabric-ca commit level: 77dc0ce08853615e6876db81fb9384c4e9c31209

##v1.0.0-alpha
For v1.0.0-alpha support, use v1performance commit level  aa73747ccf5f511fbcd10a962dd1e588bde1a8b0.  Below is the v1.0.0-alpha commit levels.

- fabric commit level: fa3d88cde177750804c7175ae000e0923199735c
- fabric-sdk-node commit level: 196d0484c884ab894374c73df89bfe047bcc9f00
- fabric-ca commit level: 29385879bc2931cce9ec833acf796129908b72fb

##pre-requisites

To build and test, the following pre-requisites must be installed first, see [Hyperledger fabric-sdk-node](https://github.com/hyperledger/fabric-sdk-node) and [Hyperledger fabric](https://github.com/hyperledger/fabric) for detail:

- node runtime version 6.9.x, note that 7.0 is not supported at this point
- npm tool version 3.10.x
- gulp command
- docker


##Setup


1. cd $GOPATH/src/github.com/hyperledger
2. git clone https://github.com/hyperledger/fabric
3. cd fabric
4. git reset --hard aa119ec8d446a34df70a281efad649626b41d395
5. make docker
6. cd ..
7. git clone https://github.com/hyperledger/fabric-ca
8. cd fabric-ca
9. git reset --hard 77dc0ce08853615e6876db81fb9384c4e9c31209
10. make docker
11. cd ..
12. git clone https://github.com/hyperledger/fabric-sdk-node.git
13. cd fabric-sdk-node
14. git reset --hard 214a499b51185ff32ba1e646e72e50f7b3b7afc4
15. run command `npm install` (remove directory node_modules if exists)
16. run command `gulp ca`
17. cd test
18. git clone https://github.com/dongmingh/v1performance
19. cd v1performance
20. For v1.0.0-alpha, `git reset --hard aa73747ccf5f511fbcd10a962dd1e588bde1a8b0`
21. add Service Credentials file for each fabric network to the SCFiles directory, see config.json in directory SCFiles as an example
22. modify runCases.txt and json file in directory userInputs according to the test, see userInput-samplecc-channel.json as an example in userInputs directory

##Scripts

- pte_driver.sh: the performance traffic engine
- pte-main.js: the PTE main js
- pte-execRequest.js: A Node js executing transaction requests
- pte-util.js: the PTE utility js


##Usage

`./pte_driver.sh <run cases file>`

- run cases file: the file contains all user specified test cases



####Examples

- ./pte_driver.sh runCases.txt

The above command will execute the transaction tests listed in the runCases.txt.



##Run Cases File

This file contains all test cases to be executed.  Each line is a test case and includes two parameters: SDK type and user input file.  Below is an example of the runCases.txt containing two test cases using Node SDK:

    sdk=node userInput-samplecc-i.json
    sdk=node userInput-samplecc-q.json

Available SDK types are node, python and java. Only node SDK is supported currently.



##User Input File


    {
        "chaincodeID": "end2end",
        "chaincodeVer": "v0",
        "chainID": "testchainid",
        "logLevel": "ERROR",
        "invokeCheck": "TRUE",
        "transMode": "Simple",
        "transType": "Invoke",
        "invokeType": "Move",
        "nOrderer": "1",
        "nOrg": "2",
        "nPeerPerOrg": "2",
        "nThread": "4",
        "nRequest": "0",
        "runDur": "600",
        "TLS": "disabled",
        "channelOpt": {
            "name": "testOrg1",
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

+ **chaincodeID**: chaincode ID for the run.  DO NOT CHANGE.

+ **chaincodeVer**: chaincode version.

+ **chainID**: chain ID for the run.  DO NOT CHANGE.

+ **legLevel**: logging level for the run.  Options are ERROR, DEBUG, or INFO.  Set to **ERROR** for performance test.  The default value is **ERROR**.

+ **invokeCheck**: if this is `TRUE`, then a query will be issued for the last invoke upon the receiving of the event of the very last invoke.  This value is ignored for query test.
 
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

+ **nOrderer**: number of orderers for traffic, this number shall not exceed the actual number of orderers in the network, or some transactions may fail.  One orderer is assigned to one thread with round robin.  If this number is 1, then the first orderer listed in the config json is assigned to all threads.

+ **nPeer**: number of peers for traffic,, this number has to match with the number of peers in the network.  Each thread is assigned with a peer with round robin.

+ **nOrg**: number of organitzations for the test

+ **nPeerPerOrg**: number of peers per organization for the test

+ **nThread**: number of threads for the test

+ **nRequest**: number of transactions to be executed for each thread

+ **runDur**: run duration in seconds to be executed if nRequest is 0

+ **TLS**: TLS setting for the test: Disabled or Enabled, ONLY **Disabled** is supported now.

+ **channelOpt**: transType channel options
  - name: channel name
  - action: channel action: create or join
  - orgName: name of organization for the test

+ **burstOpt**: the frequencies and duration for Burst transaction mode traffic. Currently, two transaction rates are supported. The traffic will issue one transaction every burstFreq0 ms for burstDur0 ms, then one transaction every burstFreq1 ms for burstDur1 ms, then the pattern repeats. These parameters are valid only if the transMode is set to **Burst**.
  - burstFreq0: frequency in ms for the first transaction rate
  - burstDur0:  duration in ms for the first transaction rate
  - burstFreq1: frequency in ms for the second transaction rate
  - burstDur1:  duration in ms for the second transaction rate


+ **mixOpt**: each invoke is followed by a query on every thread. This parameter is valid only the transMode is set to **Mix**.

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

+ **deploy**: deploy contents

+ **invoke** invoke contents
  - query: query content
  - move: move content

+ **SCFile**: the service credentials json.



##Service Credentials

The service credentials contain the following information of the network:

  - list of each peer's host and port
  - event hub's host and port
  - list of each orderer's host and port
  - ca's host and port
  - list of each user's name and secret

The service credentials for each network can be either downloaded or created by copy and paste from Bluemix if the network resides on Bluemix.  For the local network, the user needs to create a json file similar to the config-local.json in SCFiles directory. 


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

All threads will execute the same transaction concurrently. Two kinds of executions are supported.

+ By transaction number: Each thread executes the specified number of transactions specified by nRequest in the user input file.
    
+ By run time duration: Each thread executes the same transaction concurrently for the specified time duration specified by runDur in the user input file, note that nRequest is set to 0.





##Use Cases
PTE can be used for channel (create, join), deploy (install and instantiate) and transactions (invoke (move) and invoke (query)).  This all depend on the settings of run cases file, user input files, configuration file (config.json).

###Channel

For any channel activities (create or join), set transType to Channel:

    "transMode": "Simple",
    "transType": "Channel",
    "invokeType": "Move",

####create a channel

To create a channel, set the action in channelOpt to create and the name to the channel name:

    "channelOpt": {
        "name": "testOrg1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },

Note that orgName is ignored in this test.

####create a channel


To join an org to a channel, set the action in channelOpt to join, name to channel name, and orgName to org name:

    "channelOpt": {
        "name": "testOrg1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },

###deployment (install and instantiate)

To install or instantiate a chaincode, set up the deploy clause according to the test, such as:

    "deploy": {
        "chaincodePath": "github.com/sample_cc",
        "fcn": "init",
        "args": []
    },


####install a chaicode

To install a chaincode, set the transType as install:

    "transMode": "Simple",
    "transType": "instantiate",
    "invokeType": "Move",

and set channelOpt name to channel name and orgName to org name:

    "channelOpt": {
        "name":  "testOrg1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },

Note that the action is ignored.

####instantiate a chaicode

To install a chaincode, set the transType as install:

    "transMode": "Simple",
    "transType": "instantiate",
    "invokeType": "Move", 

and set channelOpt name to channel name:

    "channelOpt": {
        "name":  "testOrg1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },

Note that the action and orgName are ignored.

###transactions

####invoke (move)

To execute invoke (move) transactions, set the transType to Invoke and invokeType to Move, and specify the network parameters and desired execution parameters:

    "invokeCheck": "TRUE",
    "transMode": "Constant",
    "transType": "Invoke",
    "invokeType": "Move",
    "nOrderer": "1",
    "nOrg": "2",
    "nPeerPerOrg": "2",
    "nThread": "4",
    "nRequest": "1000",
    "runDur": "600",
    "TLS": "Disabled",

and the channel name in channelOpt:

    "channelOpt": {
        "name": "testOrg1",
        "action":  "create",
        "orgName": [
            "testOrg1"
        ]
    },


####invoke (query)

To execute invoke (move) transactions, set the transType to Invoke and invokeType to Query, and specify the network parameters and desired execution parameters:

    "invokeCheck": "TRUE",
    "transMode": "Constant",
    "transType": "Invoke",
    "invokeType": "Query",
    "nOrderer": "1",
    "nOrg": "2",
    "nPeerPerOrg": "2",
    "nThread": "4",
    "nRequest": "1000",
    "runDur": "600",
    "TLS": "Disabled",

and the channel name in channelOpt:

    "channelOpt": {
        "name": "testOrg1",
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

The following is an example of invoke queries test output. The test contains 4 threads on one network.  The output shows that network 0 thread 0 executed 100 queries with no failure in 1487 ms, network 0 thread 2 executed 100 queries with no failure in 1498 ms etc. 

    [Nid:id=0:0] completed 100 Invoke(Query) in 1487 ms, timestamp: start 1481250240860 end 1481250242347
    [Nid:id=0:2] completed 100 Invoke(Query) in 1498 ms, timestamp: start 1481250240861 end 1481250242359
    [Nid:id=0:1] completed 100 Invoke(Query) in 1525 ms, timestamp: start 1481250240861 end 1481250242386
    [Nid:id=0:3] completed 100 Invoke(Query) in 1800 ms, timestamp: start 1481250240861 end 1481250242661



##Examples

The following test cases execute the same command

    pte_driver.sh runCases.txt

with a specific runCases.txt.

####Latency

That the runCases.txt contains:

    sdk=node userInput-samplecc-latency-i.json

will execute 1000 invokes (Move) with 1 thread on one network using sample_cc chaincode.  The average of the execution result (execution time (ms)/1000 transactions) represents the latency of 1 invoke (Move).


####Long run

That the runCases.txt contains:

    sdk=node userInput-samplecc-longrun-i.json

will execute invokes (Move) of various payload size ranging from 1kb-2kb with 1 threads on one network using sample_cc chaincode for 72 hours at 1 transaction per second.


####Concurrency

That the runCases.txt contains:

    sdk=node userInput-samplecc-concurrency-i.json

will execute invokes (Move) of 1kb payload with 50 threads on one 4-peer network using sample_cc chaincode for 10 minutes.


####Complex

That the runCases.txt contains:

    sdk=node userInput-samplecc-complex-i.json

will execute invokes (Move) of various payload size ranging from 10kb-500kb with 10 threads on one 4-peer network using sample_cc chaincode for 10 minutes. Each invoke (Move) is followed by an invoke (Query).

