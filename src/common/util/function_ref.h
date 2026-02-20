#pragma once
#include <functional>

namespace catter::util {

#ifdef __cpp_lib_function_ref
using function_ref = std::function_ref;
#else

template <typename Sign>
class function_ref {
    static_assert(false, "Sign must be a function type");
};

template <typename R, typename... Args>
class function_ref<R(Args...)> {
public:
    using Sign = R(Args...);
    
    using Erased = union {
        void* ctx;
        Sign* fn;
    };

    function_ref(const function_ref&) = default;
    function_ref(function_ref&&) = default;

    function_ref& operator=(const function_ref&) = default;
    function_ref& operator=(function_ref&&) = default;


    template<typename invocable_t>
        requires std::is_invocable_r_v<R, invocable_t, Args...> && (!std::is_convertible_v<invocable_t, Sign*>)
                && (!std::is_same_v<function_ref<R(Args...)>, invocable_t>)
    constexpr function_ref(invocable_t& inv)
      : proxy{[](Erased c, Args... args) -> R {
            return std::invoke(*static_cast<invocable_t*>(c.ctx), static_cast<Args>(args)...);
        }},
        ctx{.ctx = static_cast<void*>(&inv)}
    {}

    template<typename invocable_t>
        requires std::is_invocable_r_v<R, invocable_t, Args...> && std::is_convertible_v<invocable_t, Sign*>
    constexpr function_ref(const invocable_t& inv)
      : proxy{[](Erased c, Args... args) -> R {
            return std::invoke(c.fn, static_cast<Args>(args)...);
        }},
        ctx{.fn = inv}
    {}

    constexpr R operator()(Args... args) const { return proxy(ctx, static_cast<Args>(args)...); }

private:
    R (*proxy)(Erased, Args...);
    Erased ctx;
};

#endif
}