import { PartialType } from '@nestjs/mapped-types';
import { CreateCasaDto } from './create-casa.dto';

export class UpdateCasaDto extends PartialType(CreateCasaDto) {}