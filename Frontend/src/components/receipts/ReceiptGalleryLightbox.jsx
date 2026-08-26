import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Keyboard } from "swiper/modules";
import { proxyImageUrl } from "../../api/Axios";
import { getPdfProxyUrl } from "../../utils/mediaUrlUtils";
import "swiper/css";
import "swiper/css/navigation";

const ReceiptGalleryLightbox = ({ items, initialIndex = 0, onClose }) => {
  const swiperRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!items?.length) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] bg-black/90 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt image viewer"
    >
      <div className="flex items-center justify-between px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-white/90 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={24} />
        </button>
        <span className="text-white/80 text-sm">
          {activeIndex + 1} / {items.length}
        </span>
        <div className="w-10" />
      </div>

      <div className="flex-1 min-h-0 relative">
        <Swiper
          modules={[Navigation, Keyboard]}
          initialSlide={initialIndex}
          loop={items.length > 1}
          navigation={{
            prevEl: ".gallery-lightbox-prev",
            nextEl: ".gallery-lightbox-next",
          }}
          keyboard={{ enabled: true }}
          spaceBetween={16}
          slidesPerView={1}
          className="h-full"
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => {
            setActiveIndex(swiper.realIndex);
          }}
        >
          {items.map((item) => (
            <SwiperSlide key={item.id} className="flex items-center justify-center px-4">
              {item.isPdf ? (
                <iframe
                  src={getPdfProxyUrl(item.url)}
                  title={item.storeName || "Receipt PDF"}
                  className="w-full h-full max-h-[calc(100vh-120px)] bg-white rounded"
                />
              ) : (
                <img
                  src={proxyImageUrl(item.url)}
                  alt={item.storeName || "Receipt"}
                  className="max-w-full max-h-[calc(100vh-120px)] object-contain mx-auto select-none"
                  draggable={false}
                />
              )}
            </SwiperSlide>
          ))}
        </Swiper>

        {items.length > 1 && (
          <>
            <button
              type="button"
              className="gallery-lightbox-prev absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft size={28} />
            </button>
            <button
              type="button"
              className="gallery-lightbox-next absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              aria-label="Next image"
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ReceiptGalleryLightbox;
