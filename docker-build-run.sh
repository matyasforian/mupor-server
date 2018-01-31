#!/bin/bash

docker stop mupor-server
docker rm mupor-server
docker build -t --no-cache mupur-server:latest .
docker run -tid --name mupor -p 3000:3000 mupur:latest

