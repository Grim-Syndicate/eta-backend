import 'dotenv/config'
import express from 'express';
import bodyParser from 'body-parser';

import * as staking from './staking-mechanics';
import * as questing from './questing';
import * as auction from './auction-house';
import Functions from './functions/index';

const app = express();

app.use(function (req, res, next) {
    // Website you wish to allow to connect
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    }

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', 1);

    // Pass to next layer of middleware
    next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
})); 

app.get('/', async (req, res) => {
  // const clientPromise = require('./mongodb-client');
  // const client = await clientPromise;
  res.json({ message: "Access denied!" });
  // res.status(200).json({ dbName: client.db().databaseName });
});

app.get("/wl", async (req, res) => {
  let result = await staking.addWhitelist(req.query.wallet, req.query.secret);
  res.json(result);
});

app.get("/user", async (req, res) => {
  let result = await Functions.getUser(req.query.wallet);
  res.json(result);
});

app.get("/userRoles", async (req, res) => {
  let result = await Functions.getUserRoles(req.query?.wallet?.toString());
  res.json(result);
});

app.get("/tokens", async (req, res) => {
  let result = await staking.doGetTokensInWallet(req.query.wallet);
  res.json(result);
});

app.get("/grims-state", async (req, res) => {
  let result = await staking.doGetGrimsState(req.query.wallet);
  res.json(result);
});

app.get("/verify-astra", async (req, res) => {
  let result = await staking.verifyAstra(req.query.wallet, req.query.amount);
  res.json(result);
});

app.get("/quests", async (req, res) => {
  let result = await questing.getAvailableQuests();
  res.json(result);
});

app.get("/quest/:id", async (req, res) => {
  let result = await questing.getQuest(req.params.id);
  res.json(result);
});

app.post("/quests/start", async (req, res) => {
  let result = await questing.startQuest(req.body.wallet, req.body.quest, req.body.participants, req.body.message, req.body.bh);
  res.json(result);
});

app.post("/quests/finish", async (req, res) => {
  let result = await questing.finishQuest(req.body.wallet, req.body.quest, req.body.message, req.body.bh);
  res.json(result);
});

app.post("/quests/claim", async (req, res) => {
  let result = await questing.claimRewards(req.body.wallet, req.body.quest, req.body.message, req.body.bh);
  res.json(result);
});

app.get("/quests/active", async (req, res) => {
  let result = await questing.getStartedQuests(req.query.wallet, req.query.quest);
  res.json(result);
});

app.get("/quests/start", async (req, res) => {
  let result = await questing.startQuest(req.query.wallet, req.query.quest, req.query.participants, req.query.message, req.query.bh);
  res.json(result);
});

app.get("/quests/finish", async (req, res) => {
  let result = await questing.finishQuest(req.query.wallet, req.query.quest, req.query.message, req.query.bh);
  res.json(result);
});

app.get("/quests/claim", async (req, res) => {
  let result = await questing.claimRewards(req.query.wallet, req.query.quest, req.query.message, req.query.bh);
  res.json(result);
});

app.get("/auction-house", async (req, res) => {
  let result = await auction.getActiveAuctions(req.query.wallet);
  res.json(result);
});

app.get("/auction-house/past-raffles", async (req, res) => {
    const result = await auction.getPastRaffles();
    res.json(result);
});
  
app.get("/auction-house/my-raffles", async (req, res) => {
    const result = await auction.getMyRaffles(req.query.wallet);
    res.json(result);
});

app.get("/auction-house/buy-tickets", async (req, res) => {
  let result = await auction.buyTickets(req.query.wallet, req.query.raffle, req.query.tickets, req.query.message, req.query.bh);
  res.json(result);
});

app.post("/auction-house/buy-tickets", async (req, res) => {
  let result = await auction.buyTickets(req.body.wallet, req.body.raffle, req.body.tickets, req.body.message, req.body.bh);
  res.json(result);
});

app.post("/auction-house/create-raffle", async (req, res) => {
  let result = await auction.createRaffle(req.body);
  res.json(result);
});

app.post("/auction-house/update-raffle-winners", async (req, res) => {
  let result = await auction.updateRaffleWinners(req.body);
  res.json(result);
});


app.get("/public-state", async (req, res) => {
  let result = await staking.doGetPublicState();
  res.json(result);
});

app.get("/transactions", async (req, res) => {
  let result = await staking.getTransactions(req.query.wallet);
  res.json(result);
});

app.post("/claim-points", async (req, res) => {
  let result = await staking.doClaimPoints(req.body.wallet, req.body.message, req.body.bh);
  res.json(result);
});

app.post("/stake", async (req, res) => {
  let tokens = Array.isArray(req.body.tokens) ? req.body.tokens : [req.body.tokens];
  let result = await staking.doStake(req.body.wallet, tokens, req.body.message, req.body.bh);
  res.json(result);
});

app.post("/unstake", async (req, res) => {
  let tokens = Array.isArray(req.body.tokens) ? req.body.tokens : [req.body.tokens];
  let result = await staking.doUnstake(req.body.wallet, tokens, req.body.message, req.body.bh);
  res.json(result);
});

app.post("/transfer", async (req, res) => {
  let result = await staking.doTransfer(req.body.source, req.body.destination, req.body.amount, req.body.message, req.body.bh);
  res.json(result);
});

app.get("/job/handle-transfers", async (req, res) => {
  const job = require('./jobs/handle-transfers');
  let result = await job.run();
  res.json(result);
});

app.get("/job/handle-quests", async (req, res) => {
  const job = require('./jobs/handle-quests');
  let result = await job.run();
  res.json(result);
});

app.get("/job/grims-in-wallets", async (req, res) => {
  const job = require('./jobs/grims-in-wallets');
  let result = await job.run(req.query.num);
  res.json(result);
});

app.get("/job/sol-price", async (req, res) => {
  const job = require('./jobs/sol-price');
  let result = await job.run();
  res.json(result);
});

app.get("/int", async (req, res) => {
  let result = await staking.doInternal();
  res.json(result);
});

app.get("/remove-penalty", async (req, res) => {
  let result = await staking.doRemovePenalty(req.query.wallet);
  res.json(result);
});

app.use(express.static('public'));

// Start the server
const PORT = process.env.PORT || 5050;
const server = app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
// [END gae_node_request_example]

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

function shutDown() {
    server.close(async () => {
        console.log('\nShutting down DB connection...');
        await staking.dbDisconnect();
        console.log('Done');
        process.exit(0);
    });
}
