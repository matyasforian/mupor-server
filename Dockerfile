# sudo docker build -t mupur-server:latest .
# sudo docker run -tid -v --name mupor-server -p 3000:3000 mupur-server:latest
FROM ubuntu:latest
MAINTAINER tozo07@gmail.com

RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y curl sudo graphicsmagick
RUN curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
RUN apt-get install -y nodejs
RUN apt-get install -y build-essential

WORKDIR /opt/mupur-server

ADD . /opt/mupur-server
RUN mkdir images

RUN npm install

EXPOSE 3000
CMD ["node", "index.js"]







