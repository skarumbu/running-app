import {
  BODY_TAGS, COMFORTS, FEELS, WEATHER_FEELS, accentVar, comfortOf, feelOf, labelOf, onAccentVar,
} from './feel';

test('the feel scale runs Rough to Flying with one accent each', () => {
  expect(FEELS.map(f => [f.level, f.word, f.accent])).toEqual([
    [1, 'Rough', 'a5'],
    [2, 'Meh', 'a3'],
    [3, 'Steady', 'a4'],
    [4, 'Good', 'a2'],
    [5, 'Flying', 'a1'],
  ]);
});

test('feelOf returns null for runs saved without a feel', () => {
  expect(feelOf(5)?.word).toBe('Flying');
  expect(feelOf(null)).toBeNull();
  expect(feelOf(undefined)).toBeNull();
  expect(feelOf(9)).toBeNull();
});

test('comfort has three levels and averages round to the nearest one', () => {
  expect(COMFORTS.map(c => [c.level, c.word, c.accent])).toEqual([
    [1, 'Bothered me', 'a5'],
    [2, 'Fine', 'a2'],
    [3, 'Felt great', 'a4'],
  ]);
  expect(comfortOf(2.7)?.word).toBe('Felt great');
  expect(comfortOf(1.4)?.word).toBe('Bothered me');
  expect(comfortOf(null)).toBeNull();
});

test('accent helpers produce CSS variables and fall back for unknown keys', () => {
  expect(accentVar('a3')).toBe('var(--a3)');
  expect(onAccentVar('a1')).toBe('var(--on-a1)');
  expect(accentVar('#ff0000')).toBe('var(--line)');
});

test('tag labels come from the tables', () => {
  expect(labelOf(BODY_TAGS, 'in_the_zone')).toBe('In the zone');
  expect(labelOf(WEATHER_FEELS, 'loved_the_rain')).toBe('Loved the rain');
  expect(labelOf(BODY_TAGS, 'mystery')).toBe('mystery');
});
