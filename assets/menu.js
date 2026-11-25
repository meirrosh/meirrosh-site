/* ---------- site menu ---------- */
{
const root=document.documentElement,btns=[...document.querySelectorAll(".mm-btn")],bd=document.getElementById("mmBd"),xb=document.getElementById("mmX"),mm=document.getElementById("mm"),tg=document.getElementById("mmTg"),sub=document.getElementById("mmSub");
let lastF=null,closeT=0;
const setB=o=>btns.forEach(b=>{b.setAttribute("aria-expanded",o);b.setAttribute("aria-label",o?"סגירת התפריט":"תפריט האתר")});
function mmOpen(){clearTimeout(closeT);mm.hidden=false;lastF=document.activeElement;mm.offsetWidth;setTimeout(()=>{root.classList.add("mm-open");setB(true);setTimeout(()=>{const f=mm.querySelector(".mm-a");if(f)f.focus({preventScroll:true})},450)},20)}
function mmClose(back){root.classList.remove("mm-open");setB(false);closeT=setTimeout(()=>{mm.hidden=true},950);if(back!==false&&lastF&&lastF.focus)lastF.focus({preventScroll:true})}
btns.forEach(b=>b.addEventListener("click",()=>{if(root.classList.contains("mm-open")){mmClose();return}b.classList.add("on");setTimeout(()=>{mmOpen();b.classList.remove("on")},380)}));bd.addEventListener("click",()=>mmClose());xb.addEventListener("click",()=>mmClose());
tg.addEventListener("click",()=>{const o=!sub.classList.contains("on");sub.classList.toggle("on",o);tg.setAttribute("aria-expanded",o);tg.setAttribute("aria-label",o?"סגירת רשימת הקטגוריות":"פתיחת רשימת הקטגוריות")});
addEventListener("keydown",e=>{if(!root.classList.contains("mm-open"))return;if(e.key==="Escape"){mmClose();return}
  if(e.key==="Tab"){const f=[...mm.querySelectorAll("a[href],button")].filter(x=>x.offsetParent!==null);const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}});
const home=!!document.getElementById("works");
mm.addEventListener("click",e=>{const a=e.target.closest("a");if(!a)return;
  if(!home)return; /* other pages: normal navigation */
  const cat=a.dataset.cat,go=a.dataset.go;
  if(cat!=null&&window.mrShow){e.preventDefault();mmClose(false);setTimeout(()=>window.mrShow(+cat,true),350);return}
  if(go){e.preventDefault();mmClose(false);setTimeout(()=>{if(go==="top")scrollTo({top:0,behavior:"smooth"});else{const el=document.getElementById(go);if(el)el.scrollIntoView({behavior:"smooth",block:"start"})}},350)}});
}
