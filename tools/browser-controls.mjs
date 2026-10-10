// Native desktop controls may be compact buttons or selects; activate the visible product control by its label.
export async function activateControl(page,label) {
  await page.evaluate(`(()=>{
    const original=${JSON.stringify(label)}, label=original==='Outdoor unit'?'Outdoor':original, visible=e=>e.getClientRects().length>0;
    const choose=()=>{
      for(const select of document.querySelectorAll('select')){
        if(!visible(select))continue;
        const option=[...select.options].find(e=>e.textContent.trim()===label);
        if(option){if(select.disabled||option.disabled)throw Error('Disabled choice: '+label);select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true}
      }
      return false;
    };
    // Source/scenario selects take precedence over the drawer's always-visible Examples tab.
    if(choose())return;
    if(['Live','Examples','Normal','Frosting','Defrost','Idle'].includes(label)){
      const trigger=document.querySelector('.hd-readings'), pop=document.querySelector('#readings-pop');
      if(trigger&&pop?.hidden){trigger.click();const chosen=choose();trigger.click();if(chosen)return}
    }
    const button=[...document.querySelectorAll('button,summary')].find(e=>visible(e)&&
      (e.textContent.trim()===label||e.getAttribute('aria-label')===label||e.title===label||
      label==='Readings'&&e.getAttribute('aria-controls')==='readings-pop'));
    if(button){if(button.disabled)throw Error('Disabled control: '+label);button.click();return}
    throw Error('Missing visible control: '+label);
  })()`);
}
