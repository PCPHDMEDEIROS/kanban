import '../css/theme.css'
const logoUrl=new URL('../assets/logo.png',import.meta.url).href

export function applyInstitutionalBrand(){
  document.querySelectorAll('.brand').forEach(brand=>{
    brand.classList.add('brand-logo')
    if(brand.querySelector('img'))return
    const subtitle=brand.querySelector('span')?.textContent||'Gestão da Produção'
    brand.innerHTML=`<img src="${logoUrl}" alt="HD Medeiros"><span>${subtitle}</span>`
  })
  document.querySelectorAll('.login form').forEach(form=>{
    if(form.querySelector('.login-logo'))return
    const image=document.createElement('img');image.className='login-logo';image.src=logoUrl;image.alt='HD Medeiros';form.prepend(image)
  })
}
