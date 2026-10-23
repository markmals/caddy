#pragma once
// Hand-written runtime support included by every generated header in include/generated/.

#include "rust/cxx.h"

#include <NCollection_List.hxx>
#include <Standard_Failure.hxx>
#include <Standard_Handle.hxx>
#include <Standard_NullObject.hxx>
#include <Standard_OutOfRange.hxx>
#include <TCollection_AsciiString.hxx>

#include <cstdint>
#include <exception>
#include <memory>
#include <sstream>
#include <string>

// cxx routes exceptions from `Result`-returning bridge functions through this hook. Keeping the
// OCCT exception class (e.g. `Standard_DomainError`) in the message lets callers tell kernel
// failures apart; cxx's default would only report `what()`.
namespace rust {
namespace behavior {
template <typename Try, typename Fail> static void trycatch(Try &&func, Fail &&fail) noexcept try {
  func();
} catch (const Standard_Failure &error) {
  std::string message = error.ExceptionType();
  const char *detail = error.what();
  if (detail != nullptr && detail[0] != '\0') {
    message += ": ";
    message += detail;
  }
  fail(message.c_str());
} catch (const std::exception &error) {
  fail(error.what());
} catch (...) {
  fail("unknown C++ exception");
}
} // namespace behavior
} // namespace rust

namespace occt_bindings {

template <class T> T &handle_get(const opencascade::handle<T> &handle) {
  if (handle.IsNull()) {
    throw Standard_NullObject("null handle dereferenced");
  }
  return *handle;
}

// NCollection_List has no index access; walk to the 0-based position.
template <class T> const T &list_value(const NCollection_List<T> &list, int32_t index) {
  if (index < 0 || static_cast<size_t>(index) >= static_cast<size_t>(list.Size())) {
    throw Standard_OutOfRange("list index out of range");
  }
  auto it = list.begin();
  for (int32_t i = 0; i < index; ++i) {
    ++it;
  }
  return *it;
}

} // namespace occt_bindings

// Binary in-memory stream used for every OCCT `std::ostream&` / `std::istream&` parameter, so
// BREP/STEP/STL data can move to and from Rust byte buffers without temporary files.
class OcctStream : public std::stringstream {
public:
  OcctStream() : std::stringstream(std::ios::in | std::ios::out | std::ios::binary) {}
};

inline std::unique_ptr<OcctStream> OcctStream_new() { return std::make_unique<OcctStream>(); }

inline std::unique_ptr<OcctStream> OcctStream_from_bytes(rust::Slice<const uint8_t> bytes) {
  auto stream = std::make_unique<OcctStream>();
  stream->write(reinterpret_cast<const char *>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
  stream->seekg(0);
  return stream;
}

inline rust::Vec<uint8_t> OcctStream_to_bytes(const OcctStream &stream) {
  std::string data = stream.str();
  rust::Vec<uint8_t> bytes;
  bytes.reserve(data.size());
  for (char byte : data) {
    bytes.push_back(static_cast<uint8_t>(byte));
  }
  return bytes;
}
