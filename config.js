/*
 * Everything you may want to change on the page lives in this file.
 * Edit only the text and numbers; keep the quotes, commas and brackets as they are.
 */
const SITE = {

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
   * The places on the globe. To add a place, copy one block { ... }, paste it at the end of the
   * list and change the values. Latitude: north is positive, south is negative.
   * Longitude: east is positive, west is negative. "note" is optional: delete the line if unwanted.
   */
  places: [
    { name: 'Rio de Janeiro', lat: -22.91, lon: -43.17, year: 2015, note: 'Nosso primeiro mar juntos' },
    { name: 'Manaus', lat: -3.12, lon: -60.02, year: 2016, note: 'Onde os rios se encontram' },
    { name: 'Salvador', lat: -12.97, lon: -38.5, year: 2018, note: 'Pôr do sol e acarajé' },
    { name: 'Foz do Iguaçu', lat: -25.55, lon: -54.59, year: 2022, note: 'Tanta água caindo, e nós dois olhando' },
  ],

  // The point of the globe that faces the screen when the page opens.
  globeStart: { lat: -20, lon: -48 },
};
