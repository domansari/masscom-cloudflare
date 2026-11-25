
import { certificateLogoArtwork } from "@/lib/certificate-artwork";
import { CertificateData } from "@/types/certificate";

interface CertificateHeaderProps {
  data: CertificateData;
}

const CertificateHeader = ({ data }: CertificateHeaderProps) => {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={certificateLogoArtwork} />
      {data.photoUrl && (
        <div
          role="img"
          aria-label="Student photo"
          className="absolute left-4 top-4 z-10 h-[100px] w-20 rounded border border-gray-300 bg-white bg-cover bg-center"
          style={{ backgroundImage: `url("${data.photoUrl}")` }}
        />
      )}
      <div className="absolute inset-x-0 top-0 z-10 text-center text-sm font-bold leading-4 text-black">
        Certificate ID: {data.certificateId || "Generated ID"}
      </div>

      {/* Logo and Institute Name - Reduced Gap */}
     <div className="text-center mb-5">
              <p className="text-2xl text-gray-800 mt-2"></p>
        <p className="text-2xl text-gray-800 mt-2"></p>
      </div>
      <div className="text-center mb-5">
              <p className="text-2xl text-gray-800 mt-2"></p>
        <p className="text-2xl text-gray-800 mt-2"></p>
      </div>
<div className="text-center mb-5">
              <p className="text-2xl text-gray-800 mt-2"></p>
        <p className="text-2xl text-gray-800 mt-2"></p>
      </div>
      <div className="text-center mb-5">
              <p className="text-2xl text-gray-800 mt-2"></p>
        <p className="text-2xl text-gray-800 mt-2"></p>
      </div>
       <div className="text-center mb-5">
              <p className="text-2xl text-gray-800 mt-2"></p>
        <p className="text-2xl text-gray-800 mt-2"></p>
      </div>
<div className="text-center mb-5">
              <p className="text-2xl text-gray-800 mt-2"></p>
        <p className="text-2xl text-gray-800 mt-2"></p>
      </div>
       <div className="text-center mb-5">
              <p className="text-xl text-gray-800 mt-2"></p>
        <p className="text-xl text-gray-800 mt-2"></p>
      </div>
      {/* Subtitle */}
      <div className="text-center mb-5">
        <p className="text-lg italic text-black-600">
          [An Autonomous Institution Registered Under The Public Trust Act.]
        </p>
      </div>
    </>
  );
};

export default CertificateHeader;
