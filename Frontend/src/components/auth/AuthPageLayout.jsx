import Logo from "../../assets/categorizrLogoSimple.png";
import LoginBackground from "../../assets/categorizrlogin.webp";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const SLIDES = [
  {
    title: "Track Expenses",
    subtitle: "Keep project spending under control",
    titleClass: "font-black",
  },
  {
    title: "Organize Receipts",
    subtitle: "AI-Based Sorting",
    titleClass: "font-bold",
  },
  {
    title: "Visual Reports",
    subtitle: "See where your money goes",
    titleClass: "font-bold",
  },
  {
    title: "Maximize Tax Deductions",
    subtitle: "Never Lose another Receipt",
    titleClass: "font-bold",
  },
  {
    title: "Create Reports",
    subtitle: "Run Summary and Detailed Reports",
    titleClass: "font-bold",
  },
];

const sliderSettings = {
  dots: false,
  infinite: true,
  speed: 700,
  autoplay: true,
  autoplaySpeed: 3000,
  slidesToShow: 1,
  slidesToScroll: 1,
  arrows: true,
};

const MARKETING_SITE_URL = "https://categorizr.com/";

// `showBackToWebsite` adds a link to the main website: pinned to the top-left corner on
// desktop, and in normal flow above the logo on phones (where the centered logo leaves no
// room beside it). It is opt-in so the sign-up page keeps its current layout.
const AuthPageLayout = ({ children, showBackToWebsite = false }) => (
  <div className="relative min-h-screen font-dmsans overflow-hidden">
    <div
      className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${LoginBackground})` }}
      aria-hidden
    />
    <div className="fixed inset-0 z-0 bg-white/55 backdrop-blur-[2px]" aria-hidden />

    {showBackToWebsite && (
      <a
        href={MARKETING_SITE_URL}
        className="relative z-20 mt-3 ml-3 lg:absolute lg:top-5 lg:left-6 lg:m-0 flex w-fit items-center gap-1.5 min-h-[44px] px-3 rounded-full text-sm font-semibold text-blue-900 bg-white/80 hover:bg-white shadow-sm backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 shrink-0"
          aria-hidden="true"
        >
          <path d="M12 4 6 10l6 6" />
        </svg>
        <span>Back to Categorizr.com</span>
      </a>
    )}

    <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 pb-0 lg:pb-10 lg:p-10 text-center">
        <img
          src={Logo}
          alt="Categorizr Logo"
          className="w-368 h-40 lg:mb-9 drop-shadow-sm"
        />
        <Slider {...sliderSettings} className="w-full max-w-6xl auth-hero-slider">
          {SLIDES.map((slide) => (
            <div key={slide.title} className="p-5 pb-0 lg:p-12 text-blue-900">
              <h1
                className={`text-4xl lg:text-6xl ${slide.titleClass} mb-3 drop-shadow-sm`}
              >
                {slide.title}
              </h1>
              <p className="text-xl font-medium">{slide.subtitle}</p>
            </div>
          ))}
        </Slider>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 pb-10 lg:pb-16">
        {children}
      </div>
    </div>
  </div>
);

export default AuthPageLayout;
