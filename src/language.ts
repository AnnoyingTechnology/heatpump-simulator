import { html } from './dom';
import { getLanguage, onLanguageChange, setLanguage } from './i18n';
/** A presentation-only native selector; English remains the initial default. */
export function createLanguageControl(): HTMLSelectElement {
 const sel=html('select',{class:'language-select','aria-label':'Language',title:'Language'},
  html('option',{value:'en',lang:'en'},'EN'),html('option',{value:'fr',lang:'fr'},'FR'));
 sel.value=getLanguage();
 sel.addEventListener('change',()=>{if(sel.value==='en'||sel.value==='fr')setLanguage(sel.value)});
 onLanguageChange(()=>{sel.value=getLanguage()});
 return sel;
}
