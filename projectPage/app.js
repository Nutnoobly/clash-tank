(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const tabs = $$('.intro-tabs [role="tab"]');
  function selectTab(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    $('#intro-panel').scrollTop = 0;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) { event.preventDefault(); selectTab(next); next.focus(); }
    });
  });
  $('.brand').addEventListener('click', event => {
    event.preventDefault();
    selectTab(tabs[0]);
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });

  const slides = [
    { src: 'assets/tank-side.webp', alt: 'ClashTank มุมด้านข้าง แสดงล้อ บอร์ดควบคุมและอุปกรณ์บนรถ' },
    { src: 'assets/tank-top.webp', alt: 'ClashTank มุมบน แสดง Arduino, ESP32 และการเชื่อมต่ออุปกรณ์' },
    { src: 'assets/tank-front.webp', alt: 'ClashTank ด้านหน้า แสดงเซอร์โว จอ LCD และเซนเซอร์ IR' },
    { src: 'assets/tank-back.webp', alt: 'ClashTank ด้านหลัง แสดง ESP32 และเบรดบอร์ด' },
  ];
  let currentSlide = 0;
  function showSlide(index) {
    currentSlide = (index + slides.length) % slides.length;
    const slide = slides[currentSlide];
    $('#gallery-image').src = slide.src;
    $('#gallery-image').alt = slide.alt;
    $$('.gallery-dots button').forEach((button, i) => {
      button.classList.toggle('active', i === currentSlide);
      button.setAttribute('aria-pressed', String(i === currentSlide));
    });
    $('#gallery-status').textContent = `ภาพที่ ${currentSlide + 1} จาก ${slides.length}`;
  }
  $('#gallery-previous').addEventListener('click', () => showSlide(currentSlide - 1));
  $('#gallery-next').addEventListener('click', () => showSlide(currentSlide + 1));
  $$('.gallery-dots button').forEach(button => button.addEventListener('click', () => showSlide(Number(button.dataset.slide))));
  $('.gallery-card').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    showSlide(currentSlide + (event.key === 'ArrowRight' ? 1 : -1));
  });

  const content = window.CLASHTANK || {};
  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const clean = value.trim();
    if (/^(?:javascript|data|vbscript):/i.test(clean)) return null;
    try {
      const url = new URL(clean, location.href);
      if (url.protocol === 'https:' || (url.origin === location.origin && url.protocol === location.protocol)) return url.href;
    } catch { /* A malformed optional URL remains an empty state. */ }
    return null;
  }
  const videoUrl = safeUrl(content.videoUrl);
  if (videoUrl) {
    const link = $('#video-link');
    link.href = videoUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.classList.remove('is-pending');
    link.removeAttribute('aria-disabled');
    $('#video-description').textContent = 'ดูแนวคิดและการทำงานของรถ';
  }

  const members = Array.isArray(content.members) ? content.members : [];
  const slots = Math.max(5, members.length);
  for (let index = 0; index < slots; index++) {
    const member = members[index] || {};
    const article = document.createElement('article');
    const hasName = typeof member.name === 'string' && member.name.trim();
    article.className = hasName ? 'member' : 'member empty';
    const photoUrl = safeUrl(member.photo);
    if (photoUrl) {
      const photo = document.createElement('img');
      photo.className = 'member-photo';
      photo.src = photoUrl;
      photo.alt = hasName ? `ภาพ ${member.name}` : `ภาพสมาชิกคนที่ ${index + 1}`;
      article.append(photo);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'member-photo';
      placeholder.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('icon');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#person');
      svg.append(use);
      placeholder.append(svg);
      article.append(placeholder);
    }
    const copy = document.createElement('div');
    copy.className = 'member-copy';
    if (hasName) {
      const name = document.createElement('h3');
      name.textContent = member.name;
      copy.append(name);
      for (const [key, className] of [['studentId', 'member-id'], ['role', 'member-role']]) {
        if (!member[key]) continue;
        const line = document.createElement('p');
        line.className = className;
        line.textContent = member[key];
        copy.append(line);
      }
    } else {
      const label = document.createElement('p');
      label.textContent = `สมาชิกคนที่ ${index + 1}`;
      copy.append(label);
    }
    article.append(copy);
    $('#team-members').append(article);
  }

  const viewer = $('#poster-viewer');
  const stage = $('#poster-stage');
  const posterImage = safeUrl(content.posterImage);
  const posterFile = safeUrl(content.posterFile);
  let image;
  let zoom = 1;
  let baseWidth = 0;
  function applyZoom() {
    if (!image || !baseWidth) return;
    image.style.width = `${baseWidth * zoom}px`;
    $('#poster-zoom-label').textContent = `${Math.round(zoom * 100)}%`;
    $('#poster-zoom-out').disabled = zoom <= 0.5;
    $('#poster-zoom-in').disabled = zoom >= 3;
  }
  function fitPoster() {
    if (!image || !image.naturalWidth) return;
    baseWidth = Math.min(stage.clientWidth - 48, (stage.clientHeight - 48) * image.naturalWidth / image.naturalHeight);
    zoom = 1;
    applyZoom();
    stage.scrollTo({ top: 0, left: 0 });
  }
  if (posterImage) {
    $('#poster-description').textContent = 'เปิดดูโปสเตอร์';
    image = document.createElement('img');
    image.src = posterImage;
    image.alt = 'โปสเตอร์โครงงาน ClashTank';
    image.addEventListener('load', fitPoster);
    image.addEventListener('error', () => {
      $('#poster-zoom-controls').hidden = true;
      const error = document.createElement('p');
      error.className = 'poster-error';
      error.textContent = 'เปิดรูปโปสเตอร์ไม่ได้ โปรดตรวจชื่อไฟล์และลองอีกครั้ง';
      stage.replaceChildren(error);
    });
    stage.replaceChildren(image);
    $('#poster-zoom-controls').hidden = false;
  } else if (posterFile) {
    $('#poster-description').textContent = 'เปิดดูโปสเตอร์';
    const frame = document.createElement('iframe');
    frame.src = posterFile;
    frame.title = 'โปสเตอร์ ClashTank';
    stage.replaceChildren(frame);
  }
  if (posterFile || posterImage) {
    $('#poster-download').href = posterFile || posterImage;
    $('#poster-download').hidden = false;
  }
  $('#open-poster').addEventListener('click', () => { viewer.showModal(); requestAnimationFrame(fitPoster); });
  $('#close-poster').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', event => {
    if (event.target !== viewer) return;
    const rect = viewer.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) viewer.close();
  });
  viewer.addEventListener('close', () => $('#open-poster').focus());
  $('#poster-zoom-in').addEventListener('click', () => { zoom = Math.min(3, zoom + 0.25); applyZoom(); });
  $('#poster-zoom-out').addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.25); applyZoom(); });
  $('#poster-fit').addEventListener('click', fitPoster);
  window.addEventListener('resize', () => { if (viewer.open) fitPoster(); });
})();
