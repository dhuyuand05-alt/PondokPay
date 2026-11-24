import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePortfolioContent } from '../Controllers/portfolioController.js';

const validContent = {
  name: 'Rubaya',
  role: 'Full-Stack Developer',
  location: 'Indonesia',
  headline: 'Membangun aplikasi web.',
  about: 'Mengembangkan pengalaman digital yang dapat diandalkan.',
  email: '',
  phone: '',
  github: '',
  linkedin: '',
  website: '',
  photo: '/portfolio-photo.jpeg',
  availability: 'Terbuka untuk peluang yang tepat',
  skills: ['React', 'Node.js'],
  projects: [{
    id: 'pondokpay',
    name: 'PondokPay',
    category: 'Education',
    description: 'Sistem transaksi kantin.',
    role: 'Full-stack development',
    year: '2026',
    stack: ['React', 'Node.js'],
    liveUrl: 'https://pondokpay.rubaya.tech',
    repositoryUrl: '',
    featured: true,
  }],
  experience: [],
  services: ['Full-stack web development'],
};

test('portfolio validation accepts the editable public profile fields', () => {
  assert.equal(validatePortfolioContent(validContent), null);
});

test('portfolio validation rejects script URLs and unknown fields', () => {
  assert.match(validatePortfolioContent({
    ...validContent,
    github: 'javascript:alert(1)',
  }), /tautan atau email tidak valid/);
  assert.match(validatePortfolioContent({
    ...validContent,
    password: 'should-not-be-published',
  }), /kolom yang tidak dikenal/);
});

test('portfolio validation restricts relative image paths and project content', () => {
  assert.match(validatePortfolioContent({
    ...validContent,
    photo: '//external.example/image.png',
  }), /tautan atau email tidak valid/);
  assert.match(validatePortfolioContent({
    ...validContent,
    projects: [{
      ...validContent.projects[0],
      liveUrl: 'data:text/html,example',
    }],
  }), /Daftar proyek atau pengalaman tidak valid/);
});
