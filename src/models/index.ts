import WalletModels from './wallet-content';
import Token from './token';
import StakeInfo from './stake-info';
import JSONConfigs from './json-configs';
import Transaction from './transaction';
import QuestDefinition from './quest-definition';
import QuestExecution from './quest-execution';
import QuestCompletion from './quest-completion';
import QuestClaim from './quest-claim';
import Stamina from './stamina';
import RaffleCampaign from './raffle-campaign';
import RaffleEntries from './raffle-entries';
import RaffleTransaction from './raffle-transaction';
import AstraAuction from './auction';
import Proposal from './proposal';
import ProposalVote from './proposal-vote';
import ItemDefinition from './item';

export default {
  Wallet: WalletModels.Wallet,
  WalletContent: WalletModels.WalletContent,
  Transaction: Transaction,
  Token: Token,
  StakeInfo: StakeInfo,
  QuestDefinition: QuestDefinition,
  QuestExecution: QuestExecution,
  QuestCompletion: QuestCompletion,
  QuestClaim: QuestClaim,
  Stamina: Stamina,
  RaffleCampaign: RaffleCampaign,
  RaffleEntries: RaffleEntries,
  RaffleTransaction: RaffleTransaction,
  JSONConfigs: JSONConfigs,
  AstraAuction: AstraAuction,
  Proposal: Proposal,
  ProposalVote: ProposalVote,
  ItemDefinition: ItemDefinition
}