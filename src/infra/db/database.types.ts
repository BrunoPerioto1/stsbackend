import type BetsTable from '../../db_types/Bet';
import type BetResultsTable from '../../db_types/BetsResults';
import type BettingHousesTable from '../../db_types/BettingHouse';
import type ResultsTable from '../../db_types/Results';

export interface Database {
  bets: BetsTable;
  betResults: BetResultsTable;
  bettingHouses: BettingHousesTable;
  results: ResultsTable;
}
