import { Transaction } from 'kysely';
import type BetsTable from '../../db_types/Bet';
import type BetResultsTable from '../../db_types/BetsResults';
import type BettingHousesTable from '../../db_types/BettingHouse';
import type ResultsTable from '../../db_types/Results';
import RolesTable from '../../db_types/Roles';
import UsersTable from '../../db_types/Users';
import TransactionTypesTable from '../../db_types/TransactionsTypes';
import HouseBalancesTable from '../../db_types/HouseBalances';
import HouseTransactionsTable from '../../db_types/HouseTransactions';

export interface Database {
  bets: BetsTable;
  betResults: BetResultsTable;
  bettingHouses: BettingHousesTable;
  results: ResultsTable;
  roles: RolesTable;
  users: UsersTable;
  transactionTypes: TransactionTypesTable
  houseBalances: HouseBalancesTable
  houseTransactions: HouseTransactionsTable
}
