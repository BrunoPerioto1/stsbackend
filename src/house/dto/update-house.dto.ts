import { PartialType } from '@nestjs/mapped-types';
import { CreateHouseDto } from './new-house.dto';

export class UpdateHouseDto extends PartialType(CreateHouseDto) {}