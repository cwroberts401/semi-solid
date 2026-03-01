/**
 * ImageGallery — Phase 2 <For> example component.
 *
 * Demonstrates the full For loop pattern:
 *   images = tap('product.images', [...]) → {% for image in product.images %}
 *   image.src, image.alt accessed inside the loop body
 */

import { For } from 'solid-js';
import { tap } from '$lib/runtime';

interface ImageGalleryProps {
  images?: Array<{ src: string; alt: string }>;
}

export default function ImageGallery(props: ImageGalleryProps) {
  const images = tap('product.images', props.images ?? []);

  return (
    <div class="grid grid-cols-2 gap-3">
      <For each={images}>
        {(image) => (
          <img
            src={image.src}
            alt={image.alt}
            loading="lazy"
            class="w-full h-48 object-cover rounded"
          />
        )}
      </For>
    </div>
  );
}
