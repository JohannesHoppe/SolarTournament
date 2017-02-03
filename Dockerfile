FROM nodesource/node:6.3

RUN npm install -g yarn

ADD package.json .
ADD yarn.lock .
 
RUN yarn install --ignore-engines

ADD . .

#production is broken
ENV NODE_ENV development
ENV port 80

EXPOSE 80
EXPOSE 443

CMD ["npm", "run", "startForever"] 