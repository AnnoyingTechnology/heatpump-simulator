// Native desktop controls may be compact buttons or selects; activate the visible product control by its label.
export async function activateControl(page,label) {
  await page.evaluate(`(()=>{
    const original=${JSON.stringify(label)}, label=original==='Outdoor unit'?'Outdoor':original==='Live'?'Live engine':original==='Examples'?'Fixed examples':original, visible=e=>e.getClientRects().length>0;
    const choose=()=>{
      for(const select of document.querySelectorAll('select')){
        if(!visible(select))continue;
        const option=[...select.options].find(e=>e.textContent.trim()===label);
        if(option){if(select.disabled||option.disabled)throw Error('Disabled choice: '+label);select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true}
      }
      return false;
    };
    if(choose())return;
    if(['Live engine','Fixed examples','Normal','Frosting','Defrost','Idle'].includes(label)){
      const trigger=document.querySelector('button[aria-label="Outdoor unit settings"]');
      if(trigger){trigger.click();const chosen=choose();if(chosen)return}
    }
    const button=[...document.querySelectorAll('button,summary')].find(e=>visible(e)&&
      (e.textContent.trim()===label||e.getAttribute('aria-label')===label||e.title===label));
    if(button){if(button.disabled)throw Error('Disabled control: '+label);button.click();return}
    throw Error('Missing visible control: '+label);
  })()`);
}
