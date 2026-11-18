import { ChevronLeft } from "lucide-react";
import { MARKETING_SITE_URL } from "../../utils/siteUrls";
import Logo from "../../assets/categorizrLogoSimple.png";
import LoginBackground from "../../assets/categorizrlogin.webp";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";


const SLIDES = [
  {
    title: "Track Expenses",
    subtitle: "Keep project spending under control",
  },
  {
    title: "Organize Receipts",
    subtitle: "AI-Based Sorting",
  },
  {
    title: "Visual Reports",
    subtitle: "See where your money goes",
  },
  {
    title: "Maximize Tax Deductions",
    subtitle: "Never Lose another Receipt",
  },
  {
    title: "Create Reports",
    subtitle: "Run Summary and Detailed Reports",
  },
];

// The headlines slide sideways every 3 seconds and can also be swiped (touch) or dragged
// (mouse) to the next / previous one. A fade has no drag, so it is deliberately not used.
const sliderSettings = {
  dots: false,
  arrows: false,
  infinite: true,
  speed: 700,
  autoplay: true,
  autoplaySpeed: 3000,
  // react-slick pauses autoplay while the pointer is over the slider or it has focus,
  // which made the headlines look stuck on desktop. Keep it moving.
  pauseOnHover: false,
  pauseOnFocus: false,
  pauseOnDotsHover: false,
  slidesToShow: 1,
  slidesToScroll: 1,
  swipe: true,
  touchMove: true,
  draggable: true,
};

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2";

// A small "< Home" button in the top-left corner (replacing the old black banner) that takes
// people back to the Categorizr website. Sits on a soft white pill so it reads over the
// background image.
const HomeButton = () => (
  <a
    href={MARKETING_SITE_URL}
    aria-label="Back to the Categorizr website"
    title="Back to the Categorizr website"
    className={`absolute left-3 top-3 sm:left-5 sm:top-4 z-20 inline-flex items-center gap-1.5 min-h-[44px] pl-2 pr-3.5 rounded-full bg-white/85 backdrop-blur-sm border border-slate-200 shadow-sm text-sm font-semibold text-blue-900 hover:bg-white transition ${focusRing}`}
  >
    <ChevronLeft className="w-5 h-5" aria-hidden />
    <img src={Logo} alt="" className="h-7 w-7 object-contain" />
    <span>Home</span>
  </a>
);

const AuthPageLayout = ({ children }) => (
  <div className="relative min-h-screen flex flex-col font-dmsans bg-white">
    <HomeButton />

    {/* Full-page product illustration behind the page: shown sharp (no blur) with only a
        light white wash so the dark-blue text stays readable. */}
    <div
      className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${LoginBackground})` }}
      aria-hidden
    />
    <div
      className="fixed inset-0 z-0 bg-gradient-to-b from-white/90 via-white/70 to-white/25 lg:bg-gradient-to-r lg:from-white/80 lg:via-white/40 lg:to-white/5"
      aria-hidden
    />

    <main className="relative z-10 flex-1 flex flex-col lg:flex-row">
      {/* Left half: logo and the rotating message, centred both ways. */}
      <section className="w-full lg:w-1/2 flex flex-col items-center justify-center px-6 pt-20 pb-2 lg:p-10 text-center text-blue-900">
        <div className="w-full max-w-4xl">
          <img
            src={Logo}
            alt="Categorizr Logo"
            className="h-24 lg:h-32 w-auto mx-auto mb-5 lg:mb-8 drop-shadow-sm"
          />
          <Slider {...sliderSettings} className="auth-hero-slider">
            {SLIDES.map((slide) => (
              <div key={slide.title}>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
                  {slide.title}
                </h1>
                <p className="mt-3 text-lg lg:text-xl font-medium">
                  {slide.subtitle}
                </p>
              </div>
            ))}
          </Slider>
        </div>
      </section>

      <section className="w-full lg:w-1/2 flex items-center justify-center p-6 pb-10 lg:p-10">
        {children}
      </section>
    </main>
  </div>
);

export default AuthPageLayout;
