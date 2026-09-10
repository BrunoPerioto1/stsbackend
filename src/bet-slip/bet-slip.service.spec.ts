import { detectImageMime } from './bet-slip.service';
import { normalizeExtraction } from './bet-slip-parser.service';

describe('detectImageMime', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(8),
  ]);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(16),
  ]);
  const webp = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WEBP'),
  ]);

  it('reconhece png, jpeg e webp pelos magic bytes', () => {
    expect(detectImageMime(png)).toBe('image/png');
    expect(detectImageMime(jpeg)).toBe('image/jpeg');
    expect(detectImageMime(webp)).toBe('image/webp');
  });

  // O mimetype do multipart é escolhido pelo cliente; um PDF renomeado para
  // .png passaria pela whitelist de header mas não pelos magic bytes.
  it('recusa conteúdo que não é imagem, mesmo com nome de imagem', () => {
    expect(detectImageMime(Buffer.from('%PDF-1.7 fake image'))).toBeNull();
    expect(detectImageMime(Buffer.alloc(4))).toBeNull();
  });
});

describe('normalizeExtraction · odd com boost', () => {
  const base = {
    evento: 'Ind. del Valle vs Flamengo',
    esporte: 'Futebol',
    mercado: 'Mais de 0.5 gols',
    stake: 40,
  };

  it('mantém a odd original quando ela é menor que a final', () => {
    const r = normalizeExtraction({ ...base, odd: 4.52, oddOriginal: 3.65 });
    expect(r.odd).toBe(4.52);
    expect(r.oddOriginal).toBe(3.65);
  });

  it('aceita a odd original em formato BR', () => {
    expect(
      normalizeExtraction({ ...base, odd: '4,52', oddOriginal: '3,65' })
        .oddOriginal,
    ).toBe(3.65);
  });

  // Sem boost o modelo tende a repetir a odd final; repetida ou maior não é
  // boost nenhum e não pode virar um "3.65 → 3.65" na tela.
  it('descarta original igual, maior ou inválida', () => {
    expect(
      normalizeExtraction({ ...base, odd: 4.52, oddOriginal: 4.52 })
        .oddOriginal,
    ).toBeNull();
    expect(
      normalizeExtraction({ ...base, odd: 4.52, oddOriginal: 5.1 }).oddOriginal,
    ).toBeNull();
    expect(
      normalizeExtraction({ ...base, odd: 4.52, oddOriginal: 0.9 }).oddOriginal,
    ).toBeNull();
    expect(
      normalizeExtraction({ ...base, odd: 4.52, oddOriginal: null })
        .oddOriginal,
    ).toBeNull();
  });

  it('sem odd final não existe boost', () => {
    expect(
      normalizeExtraction({ ...base, odd: null, oddOriginal: 3.65 })
        .oddOriginal,
    ).toBeNull();
  });
});
