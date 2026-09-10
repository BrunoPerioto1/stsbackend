import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '../common/decorators/user.decorator';
import { BetSlipService, MAX_IMAGE_BYTES } from './bet-slip.service';
import { ParsedBetSlipDto, ParseImageBodyDto } from './dto/parse-image.dto';

// Só o que esta rota usa do arquivo enviado — evita depender de @types/multer
// só para tipar um campo.
interface UploadedImage {
  buffer?: Buffer;
}

// Controller separado, com o mesmo prefixo do BetController: evita que o
// BetModule tenha que importar tips/casas só por causa desta rota.
@ApiTags('Apostas')
@Controller('bets')
export class BetSlipController {
  constructor(private readonly betSlipService: BetSlipService) {}

  @Post('parse-image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Lê um print de bilhete e devolve os campos da aposta (não salva)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary' },
        houseHint: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.OK, type: ParsedBetSlipDto })
  // O limite real em produção é o do body da serverless function do Vercel
  // (~4.5 MB), abaixo destes 5 MB — o app comprime antes de enviar, então na
  // prática o payload fica na casa das centenas de KB.
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  async parseImage(
    @UploadedFile() image: UploadedImage | undefined,
    @Body() body: ParseImageBodyDto,
    @User('userId') userId: number,
  ): Promise<ParsedBetSlipDto> {
    if (!image?.buffer?.length)
      throw new BadRequestException('Envie uma imagem no campo "image".');
    return this.betSlipService.parseImage({
      userId,
      buffer: image.buffer,
      houseHint: body.houseHint,
    });
  }
}
