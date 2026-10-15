import { describe, expect, it } from 'vitest';
import { animalCellCatalog } from '@bilig/content-model/fixtures/animal-cell';
import { stripLang, switchLangPath, topicPath } from './urls';

describe('switchLangPath (W-05 language bug)', () => {
  it('keeps the topic path and the whole query when switching language', () => {
    expect(switchLangPath('/ky/bio/g7/animal-cell', '?focus=bio.nucleus&mode=section', '', 'ru')).toBe(
      '/ru/bio/g7/animal-cell?focus=bio.nucleus&mode=section',
    );
  });
  it('switches the home page and nested pages', () => {
    expect(switchLangPath('/ky', '', '', 'en')).toBe('/en');
    expect(switchLangPath('/ru/teacher', '', '#x', 'ky')).toBe('/ky/teacher#x');
  });
  it('adds a language to a bare path', () => {
    expect(switchLangPath('/', '', '', 'ru')).toBe('/ru');
  });
});

describe('topicPath', () => {
  it('builds /:lang/:subject/:grade/:topic from the course tree', () => {
    expect(topicPath(animalCellCatalog, 'ky', 'animal-cell')).toBe('/ky/bio/g7/animal-cell');
  });
  it('strips the language', () => {
    expect(stripLang('/en/bio/g7/animal-cell')).toBe('/bio/g7/animal-cell');
  });
});
