import { IsNumber, IsString, IsNotEmpty, IsIn, IsPositive } from 'class-validator';

export class CreateTransacaoDto {
  @IsNumber()
  @IsNotEmpty()
  casa_id: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['DEPOSITO', 'SAQUE', 'AJUSTE'])
  tipo: 'DEPOSITO' | 'SAQUE' | 'AJUSTE';

  @IsNumber()
  @IsPositive()
  valor: number;

  @IsString()
  @IsNotEmpty()
  descricao: string;
}
