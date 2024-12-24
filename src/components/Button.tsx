export default function Button({ children, ...props }) {
  return (
    <button
      className="
        rounded-full
        dark:bg-purple-950
        px-4
        py-2
        font-semibold
        no-underline
        transition
        dark:hover:bg-pink-800
        dark:focus:bg-pink-800
        dark:hover:drop-shadow-glow
        dark:focus:drop-shadow-glow
      "
      {...props}
    >
      {children}
    </button>

  )
}

