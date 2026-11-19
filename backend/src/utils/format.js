'use strict';

// 1500 -> "Nu. 1,500"  (same look as the frontend DS.money)
const money = n => 'Nu. ' + Number(n).toLocaleString('en-US');

const capitalize = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// "electrical" -> "an electrical", "plumbing" -> "a plumbing" (used in notification texts)
const withArticle = word => (/^[aeiou]/i.test(String(word)) ? 'an ' : 'a ') + word;

module.exports = { money, capitalize, withArticle };
