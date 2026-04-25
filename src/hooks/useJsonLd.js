import { useEffect } from 'react';

// Вставляет <script type="application/ld+json"> в <head> с указанным id
// и удаляет его при размонтировании. Если data — falsy, ничего не делает.
// Используется на ProductPage (Product), HomePage (Organization) и т.п.
export function useJsonLd(id, data) {
  useEffect(() => {
    if (!id || !data) return undefined;

    const script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    try {
      script.textContent = JSON.stringify(data);
    } catch (error) {
      console.warn('useJsonLd: serialization failed', error);
      return undefined;
    }

    document.getElementById(id)?.remove();
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [id, JSON.stringify(data || null)]);
}
