import { useEffect } from 'react';

const DEFAULT_ORIGIN = 'https://emmiwood.example';

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.append(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value));
}

function upsertLink(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement('link');
    document.head.append(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value));
}

export function EmmiwoodMeta({
  title,
  description,
  path,
  noindex = false,
  structured = false,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  structured?: boolean;
}) {
  useEffect(() => {
    const configuredOrigin = import.meta.env.VITE_EMMIWOOD_PUBLIC_ORIGIN || DEFAULT_ORIGIN;
    const origin = configuredOrigin.replace(/\/$/, '');
    const canonical = `${origin}${path.endsWith('/') ? path : `${path}/`}`;

    document.title = title;
    document.documentElement.classList.remove('dark');
    document.documentElement.dataset.brand = 'emmiwood';

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large' });
    upsertMeta('meta[name="theme-color"]', { name: 'theme-color', content: '#101417' });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    const socialImage = `${origin}/emmiwood/og-emmiwood.png`;
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Emmiwood Barbers' });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: socialImage });
    upsertMeta('meta[property="og:image:secure_url"]', { property: 'og:image:secure_url', content: socialImage });
    upsertMeta('meta[property="og:image:type"]', { property: 'og:image:type', content: 'image/png' });
    upsertMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: '1200' });
    upsertMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: '630' });
    upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: 'Emmiwood Barbers — the cut should look like you, only sharper.' });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: socialImage });
    upsertMeta('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt', content: 'Emmiwood Barbers — the cut should look like you, only sharper.' });
    upsertMeta('meta[name="application-name"]', { name: 'application-name', content: 'Emmiwood Barbers' });
    upsertMeta('meta[name="apple-mobile-web-app-title"]', { name: 'apple-mobile-web-app-title', content: 'Emmiwood' });
    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonical });

    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((script) => script.remove());
    document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="manifest"], link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"], link[href*="isaiah-park"], link[imagesrcset*="isaiah-park"]',
    ).forEach((link) => link.remove());
    upsertLink('link[rel="icon"]', { rel: 'icon', type: 'image/svg+xml', href: '/emmiwood/mark.svg' });

    if (structured) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = 'emmiwood-jsonld';
      script.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Barbershop',
        '@id': `${origin}/emmiwood/#shop`,
        name: 'Emmiwood Barbers',
        url: `${origin}/emmiwood/`,
        telephone: '+16059006334',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '1118 S Minnesota Ave',
          addressLocality: 'Sioux Falls',
          addressRegion: 'SD',
          postalCode: '57105',
          addressCountry: 'US',
        },
        openingHoursSpecification: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          '@type': 'OpeningHoursSpecification', dayOfWeek, opens: '09:00', closes: '19:00',
        })),
      });
      document.head.append(script);
    }

    return () => {
      delete document.documentElement.dataset.brand;
    };
  }, [description, noindex, path, structured, title]);

  return null;
}
