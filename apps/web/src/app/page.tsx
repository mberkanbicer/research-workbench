import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto py-20 text-center flex flex-col items-center justify-center min-h-[70vh]">
      <div className="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide mb-8 shadow-sm">
        v1.0.0
      </div>
      <h1 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight text-black leading-tight">
        Evidence-Grounded <br className="hidden md:block"/> Research
      </h1>
      <p className="text-xl text-gray-600 mb-10 max-w-2xl leading-relaxed">
        A collaborative deliberation workbench designed for long-horizon research projects. Harness multiple AI models to extract, critique, and synthesize knowledge.
      </p>
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 w-full sm:w-auto">
        <Link
          href="/projects/new"
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all w-full sm:w-auto text-center"
        >
          Start New Project
        </Link>
        <Link
          href="/projects"
          className="bg-white border-2 border-gray-200 text-gray-800 hover:border-blue-300 hover:bg-blue-50 px-8 py-4 rounded-2xl font-bold text-lg transition-all w-full sm:w-auto text-center"
        >
          View Projects
        </Link>
      </div>
    </div>
  );
}
