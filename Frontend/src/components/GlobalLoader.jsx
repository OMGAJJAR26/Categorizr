import { PropagateLoader } from "react-spinners";
import { useLoader } from "../context/LoaderContext";

const GlobalLoader = () => {
  const { loading } = useLoader();

  if (!loading) return null;

  return (
    <div className="fixed inset-0 bg-white bg-opacity-70 z-50 flex items-center justify-center">
      <PropagateLoader color="#0070f3" size={15} />
    </div>
  );
};

export default GlobalLoader;
