import { IsNumber, IsString, IsNotEmpty, IsPositive } from 'class-validator';

export class CreateTransacaoDto {
  @IsNumber()
  @IsPositive()
  casa_id: number;

  @IsString()
  @IsNotEmpty()
  tipo: string; // DEPOSIT, WITHDRAWAL, ADJUSTMENT

  @IsNumber()
  valor: number;

  @IsString()
  @IsNotEmpty()
  descricao: string;
}
