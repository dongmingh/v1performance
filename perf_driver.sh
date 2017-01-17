#!/bin/bash

#
# usage: ./perf_driver.sh <user input json file> <nNetwork>
# example: ./perf_driver.sh userInput-example02.json 2
#          ./perf_driver.sh userInput-ccchecker 1
#

userinput=$1
nNetwork=$2

echo "user input: $userinput, nNetwork=$nNetwork"

CWD=$PWD
echo "current directory: $CWD"
# clone vendor
###if [ -d $ccPath/vendor/github.com/hyperledger/fabric ]; then
###    echo 'vendor dir exists'
###else
###    echo 'get vendor ...'
###    mkdir $ccPath/vendor
###    mkdir $ccPath/vendor/github.com
###    mkdir $ccPath/vendor/github.com/hyperledger
###    cd $ccPath/vendor/github.com/hyperledger
###    git clone https://github.com/hyperledger/fabric.git
###    cd $CWD
###fi

echo "pwd= $PWD"

#
# download certificate file
#
###if [ $bcHost = "bluemix" ]
###then
###
###    echo "********************** downloading certificate.pem **********************"
###    node perf-certificate.js $userinput $ccPath
###    #sleep 5
###    echo "bcHost $bcHost"
###fi

#
# set up the start execution time
#
    #tWait=$[nNetwork*4000+200000]
    tWait=$[nNetwork*4000+10000]
    tCurr=`date +%s%N | cut -b1-13`

    tStart=$[tCurr+tWait]
    #echo "timestamp: execution start= $tStart, current= $tCurr, wait= $tWait"

#
# execute performance test
#

for ((networkID=0; networkID<$nNetwork; networkID++))
do
    tCurr=`date +%s%N | cut -b1-13`
	t1=$[tStart-tCurr]
    echo  "******************** sending Network $networkID requests: now=$tCurr, starting time=$tStart, time to wait=$t1 ********************"
	node perf-main.js $networkID $userinput $tStart &
    sleep 2   # 2 seconds
done

exit
