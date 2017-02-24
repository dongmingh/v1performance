
#Performance Traffic Engine - PTE

----------

The Performance Traffic Engine (PTE) uses [Hyperledger Fabric Client (HFC) SDK](http://hyperledger-fabric.readthedocs.io/en/latest/Setup/NodeSDK-setup/) to interact with a [Hyperledger fabric](https://github.com/hyperledger/fabric) network.

##Code Base

- fabric commit level: 2fc6bc606bc5f732d9b04ce28e1d28dfbd220173
- fabric-sdk-node commit level: 425028f3f64b33d2ebaba57b276fca56c4b801ad
- fabric-ca commit level: 972143ed3e7889adc8855ffd12477139433af709


##Setup


1. git clone https://github.com/hyperledger/fabric-sdk-node.git
2. cd fabric-sdk-node
3. git reset --hard d32cdd2c3dc97f907f23432a0668b506ac7b0271
4. run command `npm install`
5. run command `gulp ca`
6. download all scripts (1 bash shell script and 3 js scripts) and all json files into directory fabric-sdk-node/test/unit
7. create a sub directory, SCFiles, under fabric-sdk-node/test/unit
8. add Service Credentials file for each fabric network to the SCFiles directory, see config-local.json in directory SCFiles as an example
9. modify userInput-ccchecer.json according to the desired test and the Service Credentials files


##Usage

`./perf_driver.sh <user input json file> <nNetwork>`

- user input json file: the json file contains all user specified parameters for the test, see below for description.
- nNetwork: number of fabric network


####Examples

- ./perf_driver.sh userInput-ccchecker.json 1

The above command will execute the performance test on one network with all parameters specified in userInput-ccchecker.json



##Scripts

- perf_driver.sh: the performance driver
- perf-main.js: the performance main js
- perf-execRequest.js: A Node js executing transaction requests


##User Input File


    {
        "chaincodeID": "end2end",
        "chaincodeVer": "v0",
        "chainID": "testchainid",
        "logLevel": "ERROR",
        "transMode": "Simple",
        "transType": "Invoke",
        "invokeType": "Move",
        "nOrderer": "1",
	    "nPeers": "4",
        "nThread": "4",
        "nRequest": "0",
        "runDur": "600",
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
            {"ServiceCredentials":"SCFiles/config-local.json"},
	        {"ServiceCredentials":"SCFiles/ServiceCredentials0000.json"},
		    {"ServiceCredentials":"SCFiles/ServiceCredentials0001.json"},
	 	    {"ServiceCredentials":"SCFiles/ServiceCredentials0002.json"},
		    {"ServiceCredentials":"SCFiles/ServiceCredentials0003.json"}
	    ]
    }
    
where:

+ **chaincodeID**: chaincode ID for the run.  DO NOT CHANGE.

+ **chaincodeVer**: chaincode version.

+ **chainID**: chain ID for the run.  DO NOT CHANGE.

+ **legLevel**: logging level for the run.  Options are ERROR, DEBUG, or INFO.  Set to **ERROR** for performance test.  The default value is **ERROR**.
 
+ **transMode**: transaction mode
  -  Simple: one transaction type and rate only, the subsequent transaction is sent when the response, success or failure, of the previous transaction is received
  -  Burst: various traffic rates, see burstOpt for detailed
  -  Mix: mix invoke and query transactions, see mixOpt for detailed
  -  Constant: the transactions are sent by the specified rate, see constantOpt for detailed

+ **transType**: transaction type
  - Deploy: deploy transaction
  - Invoke: invokes transaction

+ **invokeType**: invoke transaction type.  This parameter is valid only if the transType is set to invoke
  - Move: move transaction
  - Query: query transaction

+ **nOrderer**: number of orderers for traffic, this number shall not exceed the actual number of orderers in the network, or some transactions may fail.  One orderer is assigned to one thread with round robin.  If this number is 1, then the first orderer listed in the config json is assigned to all threads.

+ **nPeer**: number of peers for traffic,, this number has to match with the number of peers in the network.  Each thread is assigned with a peer with round robin.

+ **nThread**: number of threads for the test

+ **nRequest**: number of transactions to be executed for each thread

+ **runDur**: run duration in seconds to be executed if nRequest is 0

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

+ **SCFile**: the service credentials list, one per network



##Service Credentials

The service credentials for each network can be either downloaded or created by copy and paste from Bluemix if the network is on bluemix.  For the local network, the user needs to create a json file similar to the config-local.json in SCFiles directory. 

##Chaincodes

The following chaincodes are tested and supported:

* example02 chaincode

* ccchecker chaincode:  This chaincode supports variable payload sizes. See userInput-ccchecker.json for example of userInput file. Take the following steps to install this chaincode:
  - cd $GOPATH/src/github.com/hyperledger/fabric-sdk-node/test/fixtures/src/github.com
  - mkdir ccchecker
  - download newkeyperinvoke.go into ccchecker directory


* sample chaincode: This chaincode supports variable (randomized) payload sizes and performs encryption and decryption on the payload. Specify ccType as ccchecker when using this chaincode.  See userInput-samplecc.json for example of userInput file. Take the following steps to install this chaincode:
  - cd $GOPATH/src/github.com/hyperledger/fabric-sdk-node/test/fixtures/src/github.com
  - mkdir sample_cc
  - download chaincode_sample.go into sample_cc directory


##Transaction Execution

All threads will execute the same transaction concurrently. Two kinds of executions are supported.

+ By transaction number: Each thread executes the specified number of transactions specified by nRequest in the user input file.
    
+ By run time duration: Each thread executes the same transaction concurrently for the specified time duration specified by runDur in the user input file, note that nRequest must be 0.



##Output

The output includes network id, thread id, transaction type, total transactions, completed transactions, failed transactions, starting time, ending time, and elapsed time.

The following is an example of invoke queries test output. The test contains 4 threads on one network.  The output shows that network 0 thread 0 executed 100 queries with no failure in 1487 ms, network 0 thread 2 executed 100 queries with no failure in 1498 ms etc. 

    [Nid:id=0:0] completed 100 Invoke(Query) in 1487 ms, timestamp: start 1481250240860 end 1481250242347
    [Nid:id=0:2] completed 100 Invoke(Query) in 1498 ms, timestamp: start 1481250240861 end 1481250242359
    [Nid:id=0:1] completed 100 Invoke(Query) in 1525 ms, timestamp: start 1481250240861 end 1481250242386
    [Nid:id=0:3] completed 100 Invoke(Query) in 1800 ms, timestamp: start 1481250240861 end 1481250242661



##Examples

####Latency

The following command will execute 1000 invokes (Move) with 1 thread on one network using ccchecker chaincode.  The average of the execution result (execution time (ms)/1000 transactions) represents the latency of 1 invoke (Move).

    perf_driver.sh userInput-ccchecker-latency-i.json 1

The following command will execute 1000 invokes (Query) with 1 thread on one network using ccchecker chaincode.  The average of the execution result (execution time (ms)/1000 transactions) represents the latency of 1 invoke (Query).

    perf_driver.sh userInput-ccchecker-latency-q.json 1


####Stress

The following command will execute invokes (Move) with 4 threads on one 4-peer network using ccchecker chaincode for 600 seconds.

    perf_driver.sh userInput-ccchecker-stress-i.json 1


The following command will execute invokes (Query) with 4 threads on one 4-peer network using ccchecker chaincode for 600 seconds.

    perf_driver.sh userInput-ccchecker-stress-q.json 1

####Long run

The following command will execute invokes (Move) of various payload size ranging from 1kb-2kb with 1 threads on one network using ccchecker chaincode for 72 hours at 1 transaction per second.

    perf_driver.sh userInput-ccchecker-longrun-i.json 1


####Concurrency

The following command will execute invokes (Move) of 1kb payload with 50 threads on one 4-peer network using ccchecker chaincode for 10 minutes.

    perf_driver.sh userInput-ccchecker-concurrency-i.json 1


####Complex

The following command will execute invokes (Move) of various payload size ranging from 10kb-500kb with 10 threads on one 4-peer network using ccchecker chaincode for 10 minutes. Each invoke (Move) is followed by an invoke (Query).

    perf_driver.sh userInput-ccchecker-complex-i.json 1

