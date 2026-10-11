import test from 'node:test';import assert from 'node:assert/strict';
import{getLanguage,setLanguage,translate}from'./frontend/build/i18n.js';
test('English is default; French messages preserve supplied values and unknown source diagnostics',()=>{
 assert.equal(getLanguage(),'en');assert.equal(translate('Target'),'Target');
 setLanguage('fr');assert.equal(translate('Target'),'Consigne');assert.equal(translate('Shared coil cleanliness'),'Propreté des échangeurs');
 assert.equal(translate('Requested target temperature for Workshop north (°C)'),'Consigne demandée pour Workshop north (°C)');
 assert.equal(translate('Zoom to Kitchen [A].* room'),'Zoomer sur la pièce Kitchen [A].*');
 assert.equal(translate('Heating · idle'),'Chauffage · arrêt');
 assert.equal(translate('Electrical input: last 2 hours of simulated time, latest reading in each 10-second bin. No accepted history yet. Missing readings are gaps.'),'Puissance électrique : 2 dernières heures simulées, dernière valeur par intervalle de 10 s. Aucun historique validé. Les données manquantes restent des interruptions.');
 assert.equal(translate('native EOS: p=200000.0, unsupported x=0.001'),'native EOS: p=200000.0, unsupported x=0.001');
 assert.equal(translate('3MXM52N8'),'3MXM52N8');
 assert.equal(translate('Room 2'),'Pièce 2');
 setLanguage('en');assert.equal(translate('Room 2'),'Room 2');
});
