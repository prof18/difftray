import { useEffect, useMemo, useRef, useState } from "react";

import type { DiffSideFocus } from "./diffs-renderer.js";
import styles from "./image-diff.module.css";

export function ImageDiff({
  diffHash,
  diffSideFocus,
  fallback,
  loadImage,
  status
}: {
  readonly diffHash: string;
  readonly diffSideFocus: DiffSideFocus;
  readonly fallback: React.ReactNode;
  readonly loadImage: (side: FileImageSide) => Promise<FileImageView | null>;
  readonly status: ReviewFileView["status"];
}): React.JSX.Element {
  const sides = useMemo(
    () => visibleImageSides(status, diffSideFocus),
    [diffSideFocus, status]
  );
  const [images, setImages] = useState<
    Partial<Record<FileImageSide, FileImageView | null>>
  >({});
  const activeDiffHashRef = useRef(diffHash);
  const loadingSidesRef = useRef(new Set<FileImageSide>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (activeDiffHashRef.current === diffHash) {
      return;
    }

    activeDiffHashRef.current = diffHash;
    loadingSidesRef.current.clear();
    setImages({});
  }, [diffHash]);

  useEffect(() => {
    const missingSides = sides.filter(
      (side) => images[side] === undefined && !loadingSidesRef.current.has(side)
    );

    if (missingSides.length === 0) {
      return;
    }

    for (const side of missingSides) {
      loadingSidesRef.current.add(side);
      void loadImage(side)
        .then((image) => {
          loadingSidesRef.current.delete(side);

          if (!mountedRef.current || activeDiffHashRef.current !== diffHash) {
            return;
          }

          setImages((current) => ({
            ...current,
            [side]: image?.diffHash === diffHash && image.side === side ? image : null
          }));
        })
        .catch(() => {
          loadingSidesRef.current.delete(side);

          if (mountedRef.current && activeDiffHashRef.current === diffHash) {
            setImages((current) => ({
              ...current,
              [side]: null
            }));
          }
        });
    }
  }, [diffHash, images, loadImage, sides]);

  if (sides.some((side) => images[side] === undefined)) {
    return (
      <div className={styles.loadingState} role="status">
        <span className={styles.loadingMark} aria-hidden />
        <span>Loading image preview</span>
      </div>
    );
  }

  if (sides.some((side) => images[side] === null)) {
    return <>{fallback}</>;
  }

  const availableImages = sides.flatMap((side) => {
    const image = images[side];
    return image ? [image] : [];
  });

  return (
    <section
      aria-label="Image diff"
      className={styles.imageDiff}
      style={{ "--image-diff-columns": availableImages.length } as React.CSSProperties}
    >
      {availableImages.map((response) => (
        <ImagePanel
          key={response.side}
          onDecodeError={() => {
            setImages((current) => ({ ...current, [response.side]: null }));
          }}
          response={response}
        />
      ))}
    </section>
  );
}

function ImagePanel({
  onDecodeError,
  response
}: {
  readonly onDecodeError: () => void;
  readonly response: FileImageView;
}): React.JSX.Element {
  const label = response.side === "old" ? "Before" : "After";

  return (
    <article className={styles.imagePanel}>
      <div className={styles.imageMeta}>
        <span className={styles.imageSideLabel}>{label}</span>
        <span>
          {response.image.width} × {response.image.height}
        </span>
      </div>
      <div className={styles.imageStage}>
        <img
          alt={`${label} image, ${String(response.image.width)} by ${String(response.image.height)} pixels`}
          onError={onDecodeError}
          src={`data:${response.image.mimeType};base64,${response.image.dataBase64}`}
        />
      </div>
    </article>
  );
}

function visibleImageSides(
  status: ReviewFileView["status"],
  diffSideFocus: DiffSideFocus
): readonly FileImageSide[] {
  if (status === "added") {
    return ["new"];
  }

  if (status === "deleted") {
    return ["old"];
  }

  return diffSideFocus === "both" ? ["old", "new"] : [diffSideFocus];
}
