import type BetsTable from '../../db_types/Bet';
import type BetResultsTable from '../../db_types/BetsResults';
import type BettingHousesTable from '../../db_types/BettingHouse';
import type ResultsTable from '../../db_types/Results';

export interface Database {
  bets: BetsTable;
  bet_results: BetResultsTable;
  betting_houses: BettingHousesTable;
  results: ResultsTable;
}
