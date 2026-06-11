import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Image with a loading spinner. UI-only — does not change fetch/API behavior.
 */
const LoadingImage = ({
  src,
  alt = "",
  className = "",
  wrapperClassName = "",
  style,
  hideOnError = true,
  fallbackSrc,
  showErrorPlaceholder = false,
  loading = "lazy",
  loaderClassName = "w-3 h-3",
  onLoad,
  onError,
  ...rest
}) => {
  const [status, setStatus] = useState("loading");
  const [activeSrc, setActiveSrc] = useState(src);

  useEffect(() => {
    setActiveSrc(src);
    setStatus("loading");
  }, [src]);

  if (!src) return null;

  if (status === "error" && hideOnError && !showErrorPlaceholder) {
    return null;
  }

  const showLoader = status === "loading";
  const isOuterAbsolute = /\babsolute\b/.test(wrapperClassName);

  return (
    <span
      className={`${isOuterAbsolute ? "" : "relative"} inline-flex items-center justify-center ${wrapperClassName}`}
      style={style}
    >
      {showLoader && (
        <span
          className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded"
          aria-hidden="true"
        >
          <Loader2 className={`${loaderClassName} animate-spin text-gray-400`} />
        </span>
      )}
      {status === "error" && showErrorPlaceholder ? (
        <span className="w-full min-h-[inherit] flex items-center justify-center text-xs text-gray-400">
          Failed to load
        </span>
      ) : (
        <img
          src={activeSrc}
          alt={alt}
          className={`${className} ${showLoader ? "opacity-0" : ""}`}
          loading={loading}
          {...rest}
          onLoad={(e) => {
            setStatus("loaded");
            onLoad?.(e);
          }}
          onError={(e) => {
            if (fallbackSrc && activeSrc !== fallbackSrc) {
              setActiveSrc(fallbackSrc);
              setStatus("loading");
              return;
            }
            setStatus("error");
            if (!hideOnError) {
              onError?.(e);
            } else {
              onError?.(e);
            }
          }}
        />
      )}
    </span>
  );
};

export default LoadingImage;
