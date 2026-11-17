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
test('charge-model readouts and protection names translate through nested patterns',()=>{
 setLanguage('fr');
 assert.equal(translate('SC 3,2 K · SH held'),'SR 3,2 K · surchauffe tenue');
 assert.equal(translate('flash gas x 0,04 · EEV full open, SH 12,0 K'),'gaz flash x 0,04 · détendeur grand ouvert, surchauffe 12,0 K');
 assert.equal(translate('high-pressure limit · 85 g in accumulator'),'limite haute pression · 85 g dans l’accumulateur');
 assert.equal(translate('Compressor stopped · refrigerant shortage protection'),'Compresseur arrêté · protection manque de frigorigène');
 assert.equal(translate('Compressor stopped · liquid carryover protection'),'Compresseur arrêté · protection retour liquide');
 assert.equal(translate('Fixed SC'),'SR fixe');
 assert.equal(translate('Stopped · refrigerant shortage protection'),'Arrêt · protection manque de frigorigène');
 assert.equal(translate('Compressor stopped · condensing temperature protection'),'Compresseur arrêté · protection température de condensation');
 setLanguage('en');
});
