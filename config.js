/*
 * Everything you may want to change on the page lives in this file.
 * Edit only the text and numbers; keep the quotes, commas and brackets as they are.
 */
const SITE = {

  // The text of the browser tab.
  tabTitle: 'Sempre',

  // The big title and the small line under it.
  title: 'SEMPRE',
  subtitle: 'desde 2014',

  // The three dates. month is 1 to 12 (1 = January, 12 = December).
  dates: {
    // The day you became a couple. Used for the big "days together" number
    // and for the countdown to the next anniversary (same day and month every year).
    together: { year: 2014, month: 2, day: 5 },

    // PLACEHOLDER: the exact day you met is not known yet, so this is a guess.
    // Replace it with the real day.
    met: { year: 2012, month: 9, day: 1 },

    // Your birthday (the day you were born).
    birth: { year: 1996, month: 2, day: 3 },
  },

  /*
   * Wording of the counters.
   * Pairs with "one" and "other": "one" is used when the number is 1, "other" for any other number.
   * Where you see {anos}, the page writes the anniversary, for example "13 anos".
   * The text "big" is the large line shown instead of the number on the special day.
   */
  messages: {
    // Under the big number at the lower left.
    together: { one: 'dia junto', other: 'dias juntos' },

    // Days since you met.
    met: {
      one: 'dia desde que nos conhecemos',
      other: 'dias desde que nos conhecemos',
    },

    // Countdown to the next anniversary.
    anniversary: {
      one: 'dia para os nossos {anos}',
      other: 'dias para os nossos {anos}',
    },
    // On the anniversary day itself.
    anniversaryToday: { big: 'Hoje', label: 'fazemos {anos}' },

    // The day you will have known each other for more than half of his life.
    // Before that day:
    halfBefore: {
      one: 'dia para eu te conhecer há mais da metade da minha vida',
      other: 'dias para eu te conhecer há mais da metade da minha vida',
    },
    // On that day:
    halfToday: { big: 'Hoje', label: 'te conheço há exatamente metade da minha vida' },
    // After that day:
    halfAfter: {
      one: 'dia desde que te conheço há mais da metade da minha vida',
      other: 'dias desde que te conheço há mais da metade da minha vida',
    },
  },

  /*
   * The places on the globe, oldest first. To add a place, copy one block { ... }, paste it at the end of the
   * list and change the values. Latitude: north is positive, south is negative.
   * Longitude: east is positive, west is negative.
   * The date is the year and the month (1 to 12). The month is optional: with only a year, only the year is shown.
   * "note" is optional too: a short line under the name. Delete the line if unwanted.
   * Nothing else needs to change when you add or remove a place.
   */
  places: [
    { name: 'Campos do Jordão', lat: -22.74, lon: -45.59, year: 2021, month: 10 },
    { name: 'Gramado', lat: -29.38, lon: -50.87, year: 2022, month: 1 },
    { name: 'Ubatuba', lat: -23.43, lon: -45.08, year: 2022, month: 12 },
    { name: 'Itu', lat: -23.26, lon: -47.3, year: 2023, month: 4 },
    { name: 'Guildford', lat: 51.24, lon: -0.57, year: 2024, month: 12 },
    { name: 'Londres', lat: 51.51, lon: -0.13, year: 2025, month: 7 },
    { name: 'Bath', lat: 51.38, lon: -2.36, year: 2025, month: 7 },
    { name: 'Godalming', lat: 51.19, lon: -0.61, year: 2026, month: 7 },
  ],

  /*
   * Wording under the globe. {mês} and {ano} are replaced by the month name and the year.
   */
  placeTexts: {
    months: [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
    ],
    monthAndYear: '{mês} de {ano}',

    // Several places close together are drawn as one pin, with the number of places beside it. {n} is that number.
    // The first line is shown under the globe when the group is selected; the second line asks to zoom in.
    group: { one: '{n} lugar', other: '{n} lugares', hint: 'Aproxime para ver cada um' },
  },

  // The point of the globe that faces the screen when the page opens.
  globeStart: { lat: -20, lon: -48 },
};
