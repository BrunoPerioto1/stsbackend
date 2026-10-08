import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Mensagem de Telegram tem até 4096 caracteres.
const MAX_MESSAGE = 4096;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const TEMPLATE_DOC = {
  description:
    'Onde está cada campo. Ver src/tip-sources/tip-template.ts. Regra: { line?, after?, until?, fixed? }.',
  example: {
    marker: 'TIP DO DIA',
    fields: {
      house: { after: 'Casa:' },
      game: { after: 'Jogo:' },
      sport: { fixed: 'Futebol' },
      market: { after: 'Mercado:' },
      odd: { after: 'Odd:' },
      percent: { after: 'Stake' },
    },
  },
};

export class CreateTipSourceDTO {
  @ApiProperty({ example: 'Tipster X' })
  // Apara antes de validar: "   " passaria no MinLength.
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  // A forma do modelo é conferida no serviço (parseTemplate), que diz qual
  // campo está errado em português; o class-validator só garante objeto.
  @ApiProperty(TEMPLATE_DOC)
  @IsObject()
  template!: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Mensagem de exemplo em que os campos foram marcados' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE)
  sampleText?: string | null;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTipSourceDTO extends PartialType(CreateTipSourceDTO) {}

export class PreviewTipSourceDTO {
  @ApiProperty({ description: 'Mensagem a ler com o modelo' })
  @IsString()
  @MaxLength(MAX_MESSAGE)
  text!: string;

  @ApiProperty(TEMPLATE_DOC)
  @IsObject()
  template!: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Nome que sai na linha 📣 Fonte do card' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiProperty({ required: false, description: 'Fonte sendo editada: as tips dela não contam como conflito' })
  @IsOptional()
  @IsInt()
  id?: number;
}

export class SetTipSourceDTO {
  @ApiProperty({ description: 'false = não receber as tips desta fonte' })
  @IsBoolean()
  enabled!: boolean;
}
